package doorlink

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 90 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 8192
)

// DoorConnection represents a WebSocket connection with a door
type DoorConnection struct {
	ws     *websocket.Conn
	server *Server
	send   chan []byte
	doorID uuid.UUID
}

// readPump handles incoming messages from the door
func (c *DoorConnection) readPump() {
	defer func() {
		if c.doorID != uuid.Nil {
			c.server.unregisterDoor(c.doorID)
		}
		c.ws.Close()
	}()

	c.ws.SetReadLimit(maxMessageSize)
	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[DoorLink] Read error: %v", err)
			}
			break
		}

		c.handleMessage(message)
	}
}

// writePump handles outgoing messages to the door
func (c *DoorConnection) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.ws.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("[DoorLink] Write error: %v", err)
				return
			}
		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *DoorConnection) handleMessage(data []byte) {
	var base BaseMessage
	if err := json.Unmarshal(data, &base); err != nil {
		log.Printf("[DoorLink] Parse error: %v", err)
		return
	}

	switch base.Type {
	case "hello":
		c.handleHello(data)
	case "ack":
		c.handleAck(data)
	case "access_event":
		c.handleAccessEvent(data)
	default:
		log.Printf("[DoorLink] Unknown message type: %s", base.Type)
	}
}

func (c *DoorConnection) handleHello(data []byte) {
	var msg HelloMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("[DoorLink] Invalid HELLO: %v", err)
		return
	}

	doorID, err := uuid.Parse(msg.DoorID)
	if err != nil {
		log.Printf("[DoorLink] Invalid door_id in HELLO: %v", err)
		return
	}

	c.doorID = doorID
	c.server.registerDoor(doorID, c)

	// Send WELCOME
	welcome := WelcomeMessage{
		Type:          "welcome",
		ServerTime:    time.Now().Unix(),
		ConfigVersion: 1,
		Sync: SyncInfo{
			Mode:    "full", // Always do full sync for simplicity
			FromSeq: msg.LastSyncSeq,
		},
	}
	resp, _ := json.Marshal(welcome)
	c.send <- resp

	// Perform full sync
	ctx := context.Background()
	go c.server.fullSync(ctx, c)
}

func (c *DoorConnection) handleAck(data []byte) {
	var msg AckMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("[DoorLink] Invalid ACK: %v", err)
		return
	}

	log.Printf("[DoorLink] Door %s ACK seq %d", c.doorID, msg.Seq)

	// Update last_sync_seq
	ctx := context.Background()
	c.server.doorRepo.UpdateSyncSeq(ctx, c.doorID, msg.Seq)
}

func (c *DoorConnection) handleAccessEvent(data []byte) {
	var msg AccessEventMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("[DoorLink] Invalid ACCESS_EVENT: %v", err)
		return
	}

	ctx := context.Background()
	c.server.handleAccessEvent(ctx, &msg)
}
