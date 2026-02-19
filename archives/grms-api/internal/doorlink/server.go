package doorlink

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"grms-backend/internal/domain"
	"grms-backend/internal/pkg/crypto"
	"grms-backend/internal/repository"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true }, // TODO: Secure in production
}

// Server manages WebSocket connections with doors
type Server struct {
	connections map[uuid.UUID]*DoorConnection
	mu          sync.RWMutex
	doorRepo    *repository.DoorRepository
	grantRepo   *repository.GrantRepository
	eventRepo   *repository.EventRepository
	masterKey   []byte
}

// NewServer creates a new DoorLink server
func NewServer(
	doorRepo *repository.DoorRepository,
	grantRepo *repository.GrantRepository,
	eventRepo *repository.EventRepository,
	masterKey []byte,
) *Server {
	return &Server{
		connections: make(map[uuid.UUID]*DoorConnection),
		doorRepo:    doorRepo,
		grantRepo:   grantRepo,
		eventRepo:   eventRepo,
		masterKey:   masterKey,
	}
}

// ServeHTTP handles WebSocket upgrade requests
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[DoorLink] Upgrade error: %v", err)
		return
	}

	doorConn := &DoorConnection{
		ws:     conn,
		server: s,
		send:   make(chan []byte, 256),
	}

	go doorConn.readPump()
	go doorConn.writePump()
}

// PushGrantDelta sends a grant delta to a specific door
func (s *Server) PushGrantDelta(ctx context.Context, doorID uuid.UUID, add []domain.DoorGrantCache, remove []uuid.UUID) error {
	s.mu.RLock()
	conn, ok := s.connections[doorID]
	s.mu.RUnlock()

	if !ok {
		log.Printf("[DoorLink] Door %s not connected, delta will sync on reconnection", doorID)
		return nil
	}

	seq, _ := s.grantRepo.GetNextSyncSeq(ctx)

	msg := GrantDeltaMessage{
		Type:   "grant_delta",
		Seq:    seq,
		DoorID: doorID.String(),
	}

	// Process additions
	for _, g := range add {
		// Decrypt secret_door for transmission
		secretDoor, err := crypto.DecryptSecret(s.masterKey, g.SecretDoorEnc)
		if err != nil {
			log.Printf("[DoorLink] Failed to decrypt secret_door: %v", err)
			continue
		}

		msg.Add = append(msg.Add, GrantEntry{
			KeyID:         g.KeyID.String(),
			GrantID:       g.GrantID.String(),
			FromTS:        g.FromTS,
			ToTS:          g.ToTS,
			SecretDoorB64: encodeBase64(secretDoor),
		})
	}

	// Process removals
	for _, gid := range remove {
		msg.Remove = append(msg.Remove, GrantRemoveEntry{GrantID: gid.String()})
	}

	data, _ := json.Marshal(msg)
	conn.send <- data

	log.Printf("[DoorLink] Pushed delta to door %s: +%d -%d", doorID, len(add), len(remove))

	return nil
}

// IsConnected checks if a door is currently connected
func (s *Server) IsConnected(doorID uuid.UUID) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.connections[doorID]
	return ok
}

// GetConnectedDoors returns IDs of all connected doors
func (s *Server) GetConnectedDoors() []uuid.UUID {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := make([]uuid.UUID, 0, len(s.connections))
	for id := range s.connections {
		ids = append(ids, id)
	}
	return ids
}

func (s *Server) registerDoor(doorID uuid.UUID, conn *DoorConnection) {
	s.mu.Lock()
	// Close existing connection if any
	if existing, ok := s.connections[doorID]; ok {
		close(existing.send)
	}
	s.connections[doorID] = conn
	s.mu.Unlock()

	// Update door status
	ctx := context.Background()
	now := time.Now()
	s.doorRepo.UpdateStatus(ctx, doorID, domain.DoorStatusOnline, &now)

	log.Printf("[DoorLink] Door %s connected", doorID)
}

func (s *Server) unregisterDoor(doorID uuid.UUID) {
	s.mu.Lock()
	delete(s.connections, doorID)
	s.mu.Unlock()

	ctx := context.Background()
	s.doorRepo.UpdateStatus(ctx, doorID, domain.DoorStatusOffline, nil)

	log.Printf("[DoorLink] Door %s disconnected", doorID)
}

func (s *Server) handleAccessEvent(ctx context.Context, msg *AccessEventMessage) {
	eventID, _ := uuid.Parse(msg.EventID)
	doorID, _ := uuid.Parse(msg.DoorID)
	keyID, _ := uuid.Parse(msg.KeyID)
	grantID, _ := uuid.Parse(msg.GrantID)

	metaJSON, _ := json.Marshal(msg.Meta)

	event := &domain.AccessEvent{
		EventID: eventID,
		TS:      time.Unix(msg.TS, 0),
		DoorID:  doorID,
		GrantID: grantID,
		UserID:  keyID,
		Result:  msg.Result,
		ErrCode: msg.ErrorCode,
		Meta:    metaJSON,
	}

	if err := s.eventRepo.Create(ctx, event); err != nil {
		log.Printf("[DoorLink] Failed to save access event: %v", err)
		return
	}

	log.Printf("[DoorLink] Access event: door=%s user=%s result=%s", doorID, keyID, msg.Result)
}

// FullSync sends all grants to a newly connected door
func (s *Server) fullSync(ctx context.Context, conn *DoorConnection) {
	entries, err := s.grantRepo.GetDoorCacheEntries(ctx, conn.doorID)
	if err != nil {
		log.Printf("[DoorLink] Failed to get grants for door %s: %v", conn.doorID, err)
		return
	}

	if len(entries) == 0 {
		log.Printf("[DoorLink] No grants to sync for door %s", conn.doorID)
		return
	}

	seq, _ := s.grantRepo.GetNextSyncSeq(ctx)

	msg := GrantReplaceMessage{
		Type:   "grant_replace",
		Seq:    seq,
		DoorID: conn.doorID.String(),
	}

	for _, e := range entries {
		// Decrypt secret_door
		secretDoor, err := crypto.DecryptSecret(s.masterKey, e.SecretDoorEnc)
		if err != nil {
			log.Printf("[DoorLink] Failed to decrypt secret_door: %v", err)
			continue
		}

		msg.Grants = append(msg.Grants, GrantEntry{
			KeyID:         e.KeyID.String(),
			GrantID:       e.GrantID.String(),
			FromTS:        e.FromTS,
			ToTS:          e.ToTS,
			SecretDoorB64: encodeBase64(secretDoor),
		})
	}

	data, _ := json.Marshal(msg)
	conn.send <- data

	log.Printf("[DoorLink] Full sync to door %s: %d grants", conn.doorID, len(msg.Grants))
}
