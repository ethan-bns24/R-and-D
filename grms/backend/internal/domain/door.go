package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Door represents a physical door with BLE capability
type Door struct {
	DoorID       uuid.UUID       `json:"door_id" db:"door_id"`
	RoomID       *uuid.UUID      `json:"room_id,omitempty" db:"room_id"`
	BleID        string          `json:"ble_id" db:"ble_id"`
	Status       string          `json:"status" db:"status"`
	LockedUntil  *time.Time      `json:"locked_until,omitempty" db:"locked_until"`
	LastSeenAt   *time.Time      `json:"last_seen_at,omitempty" db:"last_seen_at"`
	FWVersion    string          `json:"fw_version" db:"fw_version"`
	Capabilities json.RawMessage `json:"capabilities" db:"capabilities"`
	LastSyncSeq  int64           `json:"last_sync_seq" db:"last_sync_seq"`
	CreatedAt    time.Time       `json:"created_at" db:"created_at"`
}

// DoorStatus constants
const (
	DoorStatusOnline  = "online"
	DoorStatusOffline = "offline"
	DoorStatusLocked  = "locked"
)

// DoorCapabilities represents door features
type DoorCapabilities struct {
	BLE      bool `json:"ble"`
	UWB      bool `json:"uwb"`
	BGUnlock bool `json:"bg_unlock"`
}

// GetCapabilities parses and returns door capabilities
func (d *Door) GetCapabilities() DoorCapabilities {
	var caps DoorCapabilities
	if d.Capabilities != nil {
		json.Unmarshal(d.Capabilities, &caps)
	}
	return caps
}

// IsOnline returns true if the door was seen recently (within 2 minutes)
func (d *Door) IsOnline() bool {
	if d.LastSeenAt == nil {
		return false
	}
	return time.Since(*d.LastSeenAt) < 2*time.Minute
}

// IsLocked returns true if the door is currently locked
func (d *Door) IsLocked() bool {
	if d.LockedUntil == nil {
		return false
	}
	return time.Now().Before(*d.LockedUntil)
}
