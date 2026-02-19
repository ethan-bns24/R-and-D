package service

import (
	"context"
	"encoding/base64"
	"errors"
	"time"

	"github.com/google/uuid"

	"grms-backend/internal/domain"
	"grms-backend/internal/pkg/crypto"
	"grms-backend/internal/repository"
)

var (
	ErrUserNotFound  = errors.New("user not found")
	ErrRoomNotFound  = errors.New("room not found")
	ErrDoorNotFound  = errors.New("door not found")
	ErrGrantNotFound = errors.New("grant not found")
	ErrGrantExpired  = errors.New("grant expired")
	ErrGrantInvalid  = errors.New("grant invalid")
)

// DoorLinkPusher interface for pushing grants to doors via WebSocket
type DoorLinkPusher interface {
	PushGrantDelta(ctx context.Context, doorID uuid.UUID, add []domain.DoorGrantCache, remove []uuid.UUID) error
	IsConnected(doorID uuid.UUID) bool
}

// GrantService handles access grant operations
type GrantService struct {
	grantRepo *repository.GrantRepository
	userRepo  *repository.UserRepository
	doorRepo  *repository.DoorRepository
	roomRepo  *repository.RoomRepository
	auditRepo *repository.AuditRepository
	doorLink  DoorLinkPusher
	masterKey []byte
}

// NewGrantService creates a new grant service
func NewGrantService(
	grantRepo *repository.GrantRepository,
	userRepo *repository.UserRepository,
	doorRepo *repository.DoorRepository,
	roomRepo *repository.RoomRepository,
	auditRepo *repository.AuditRepository,
	doorLink DoorLinkPusher,
	masterKey []byte,
) *GrantService {
	return &GrantService{
		grantRepo: grantRepo,
		userRepo:  userRepo,
		doorRepo:  doorRepo,
		roomRepo:  roomRepo,
		auditRepo: auditRepo,
		doorLink:  doorLink,
		masterKey: masterKey,
	}
}

// AssignRequest represents a room assignment request
type AssignRequest struct {
	UserEmail  string    `json:"user_email"`
	RoomID     uuid.UUID `json:"room_id"`
	RoomNumber string    `json:"room_number,omitempty"` // Alternative to room_id
	FromTS     int64     `json:"from_ts"`
	ToTS       int64     `json:"to_ts"`
}

// AssignResponse represents a successful assignment
type AssignResponse struct {
	GrantID uuid.UUID  `json:"grant_id"`
	UserID  uuid.UUID  `json:"user_id"`
	FromTS  int64      `json:"from_ts"`
	ToTS    int64      `json:"to_ts"`
	Doors   []DoorInfo `json:"doors"`
}

// DoorInfo represents door information for mobile
type DoorInfo struct {
	DoorID uuid.UUID `json:"door_id"`
	BleID  string    `json:"ble_id"`
}

// Assign creates an AccessGrant for a user on a room
func (s *GrantService) Assign(ctx context.Context, req AssignRequest, staffID uuid.UUID) (*AssignResponse, error) {
	// 1. Find the user
	user, err := s.userRepo.FindByEmail(ctx, req.UserEmail)
	if err != nil {
		return nil, ErrUserNotFound
	}

	// 2. Find the room (by ID or number)
	var roomID uuid.UUID
	if req.RoomID != uuid.Nil {
		roomID = req.RoomID
	} else if req.RoomNumber != "" {
		room, err := s.roomRepo.FindByNumber(ctx, req.RoomNumber)
		if err != nil {
			return nil, ErrRoomNotFound
		}
		roomID = room.RoomID
	} else {
		return nil, ErrRoomNotFound
	}

	// 3. Find doors for this room
	doors, err := s.doorRepo.FindByRoomID(ctx, roomID)
	if err != nil || len(doors) == 0 {
		return nil, ErrRoomNotFound
	}

	// 4. Generate secret_base
	secretBase, err := crypto.GenerateSecretBase()
	if err != nil {
		return nil, err
	}

	// 5. Encrypt secret_base for storage
	secretBaseEnc, err := crypto.EncryptSecret(s.masterKey, secretBase)
	if err != nil {
		return nil, err
	}

	// 6. Create the grant
	grant := &domain.AccessGrant{
		GrantID:          uuid.New(),
		UserID:           user.UserID,
		SecretBaseEnc:    secretBaseEnc,
		FromTS:           req.FromTS,
		ToTS:             req.ToTS,
		Status:           domain.GrantStatusActive,
		CreatedByStaffID: &staffID,
		CreatedAt:        time.Now(),
	}

	if err := s.grantRepo.Create(ctx, grant); err != nil {
		return nil, err
	}

	// 7. Associate doors and push to each
	var doorInfos []DoorInfo
	for _, door := range doors {
		// Add door to grant
		if err := s.grantRepo.AddDoor(ctx, grant.GrantID, door.DoorID); err != nil {
			return nil, err
		}
		doorInfos = append(doorInfos, DoorInfo{
			DoorID: door.DoorID,
			BleID:  door.BleID,
		})

		// Derive secret_door for this specific door
		secretDoor, err := crypto.DeriveSecretDoor(secretBase, door.DoorID)
		if err != nil {
			return nil, err
		}

		// Encrypt secret_door for storage
		secretDoorEnc, err := crypto.EncryptSecret(s.masterKey, secretDoor)
		if err != nil {
			return nil, err
		}

		// Get next sync sequence
		seq, _ := s.grantRepo.GetNextSyncSeq(ctx)

		// Create cache entry
		cacheEntry := domain.DoorGrantCache{
			DoorID:        door.DoorID,
			GrantID:       grant.GrantID,
			KeyID:         user.UserID,
			FromTS:        req.FromTS,
			ToTS:          req.ToTS,
			SecretDoorEnc: secretDoorEnc,
			PushSeq:       seq,
		}

		if err := s.grantRepo.UpsertDoorCache(ctx, &cacheEntry); err != nil {
			return nil, err
		}

		// Push via DoorLink if connected
		if s.doorLink != nil {
			go s.doorLink.PushGrantDelta(ctx, door.DoorID, []domain.DoorGrantCache{cacheEntry}, nil)
		}
	}

	// 8. Update room status
	s.roomRepo.UpdateStatus(ctx, roomID, domain.RoomStatusOccupied)

	// 9. Audit log
	s.auditRepo.Log(ctx, "staff", staffID, domain.AuditActionGrantCreated, "access_grant", grant.GrantID, map[string]interface{}{
		"user_id":    user.UserID,
		"user_email": user.Email,
		"room_id":    roomID,
		"from_ts":    req.FromTS,
		"to_ts":      req.ToTS,
	})

	return &AssignResponse{
		GrantID: grant.GrantID,
		UserID:  user.UserID,
		FromTS:  req.FromTS,
		ToTS:    req.ToTS,
		Doors:   doorInfos,
	}, nil
}

// Revoke invalidates an AccessGrant
func (s *GrantService) Revoke(ctx context.Context, grantID uuid.UUID, staffID uuid.UUID) error {
	grant, err := s.grantRepo.FindByID(ctx, grantID)
	if err != nil {
		return ErrGrantNotFound
	}

	// Update grant status
	now := time.Now()
	grant.Status = domain.GrantStatusRevoked
	grant.RevokedAt = &now
	grant.RevokedByStaffID = &staffID

	if err := s.grantRepo.Update(ctx, grant); err != nil {
		return err
	}

	// Get associated doors and push remove
	doors, err := s.grantRepo.GetDoors(ctx, grantID)
	if err == nil && s.doorLink != nil {
		for _, door := range doors {
			go s.doorLink.PushGrantDelta(ctx, door.DoorID, nil, []uuid.UUID{grantID})
		}
	}

	// Delete from cache
	s.grantRepo.DeleteDoorCache(ctx, grantID)

	// Audit
	s.auditRepo.Log(ctx, "staff", staffID, domain.AuditActionGrantRevoked, "access_grant", grantID, map[string]interface{}{
		"user_id": grant.UserID,
	})

	return nil
}

// MobileGrantsResponse is sent to the mobile app
type MobileGrantsResponse struct {
	KeyID         uuid.UUID     `json:"key_id"`
	SecretBaseB64 string        `json:"secret_base_b64"`
	Grants        []MobileGrant `json:"grants"`
}

// MobileGrant represents a grant for mobile display
type MobileGrant struct {
	GrantID uuid.UUID  `json:"grant_id"`
	FromTS  int64      `json:"from_ts"`
	ToTS    int64      `json:"to_ts"`
	Doors   []DoorInfo `json:"doors"`
}

// GetUserGrants retrieves active grants for a user (mobile endpoint)
func (s *GrantService) GetUserGrants(ctx context.Context, userID uuid.UUID) (*MobileGrantsResponse, error) {
	now := time.Now().Unix()
	grants, err := s.grantRepo.FindActiveByUserID(ctx, userID, now)
	if err != nil {
		return nil, err
	}

	if len(grants) == 0 {
		return &MobileGrantsResponse{
			KeyID:  userID,
			Grants: []MobileGrant{},
		}, nil
	}

	// Use secret_base from the first active grant
	// (in production, each grant has its own secret)
	var secretBase []byte
	var mobileGrants []MobileGrant

	for _, grant := range grants {
		if secretBase == nil {
			secretBase, err = crypto.DecryptSecret(s.masterKey, grant.SecretBaseEnc)
			if err != nil {
				return nil, err
			}
		}

		doors, _ := s.grantRepo.GetDoors(ctx, grant.GrantID)
		var doorInfos []DoorInfo
		for _, d := range doors {
			doorInfos = append(doorInfos, DoorInfo{
				DoorID: d.DoorID,
				BleID:  d.BleID,
			})
		}

		mobileGrants = append(mobileGrants, MobileGrant{
			GrantID: grant.GrantID,
			FromTS:  grant.FromTS,
			ToTS:    grant.ToTS,
			Doors:   doorInfos,
		})
	}

	return &MobileGrantsResponse{
		KeyID:         userID,
		SecretBaseB64: base64.StdEncoding.EncodeToString(secretBase),
		Grants:        mobileGrants,
	}, nil
}

// GetGrantByID retrieves a specific grant
func (s *GrantService) GetGrantByID(ctx context.Context, grantID uuid.UUID) (*domain.AccessGrant, error) {
	return s.grantRepo.FindByID(ctx, grantID)
}
