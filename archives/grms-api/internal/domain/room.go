package domain

import (
	"time"

	"github.com/google/uuid"
)

// Room represents a hotel room
type Room struct {
	RoomID     uuid.UUID `json:"room_id" db:"room_id"`
	RoomNumber string    `json:"room_number" db:"room_number"`
	Label      *string   `json:"label,omitempty" db:"label"`
	Floor      *int      `json:"floor,omitempty" db:"floor"`
	Status     string    `json:"status" db:"status"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`

	// Relations (populated on demand)
	Doors []Door `json:"doors,omitempty" db:"-"`
}

// RoomStatus constants
const (
	RoomStatusAvailable   = "available"
	RoomStatusOccupied    = "occupied"
	RoomStatusMaintenance = "maintenance"
	RoomStatusLocked      = "locked"
)

// IsAvailable returns true if the room can be assigned
func (r *Room) IsAvailable() bool {
	return r.Status == RoomStatusAvailable
}
