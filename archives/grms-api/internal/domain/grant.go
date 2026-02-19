package domain

import (
	"time"

	"github.com/google/uuid"
)

// GrantStatus constants
const (
	GrantStatusActive  = "active"
	GrantStatusRevoked = "revoked"
	GrantStatusExpired = "expired"
)

// AccessGrant represents a time-bound access right for a user
type AccessGrant struct {
	GrantID          uuid.UUID  `json:"grant_id" db:"grant_id"`
	UserID           uuid.UUID  `json:"user_id" db:"user_id"`
	SecretBaseEnc    []byte     `json:"-" db:"secret_base_enc"` // Never expose
	FromTS           int64      `json:"from_ts" db:"from_ts"`   // Unix timestamp seconds
	ToTS             int64      `json:"to_ts" db:"to_ts"`       // Unix timestamp seconds
	Status           string     `json:"status" db:"status"`
	CreatedByStaffID *uuid.UUID `json:"created_by_staff_id,omitempty" db:"created_by_staff_id"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty" db:"revoked_at"`
	RevokedByStaffID *uuid.UUID `json:"revoked_by_staff_id,omitempty" db:"revoked_by_staff_id"`

	// Relations (populated on demand)
	Doors []Door `json:"doors,omitempty" db:"-"`
	User  *User  `json:"user,omitempty" db:"-"`
}

// IsValid checks if the grant is valid at the given Unix timestamp
func (g *AccessGrant) IsValid(nowUnix int64) bool {
	return g.Status == GrantStatusActive &&
		nowUnix >= g.FromTS &&
		nowUnix <= g.ToTS
}

// IsExpired returns true if the grant has passed its end time
func (g *AccessGrant) IsExpired(nowUnix int64) bool {
	return nowUnix > g.ToTS
}

// IsNotYetValid returns true if the grant hasn't started yet
func (g *AccessGrant) IsNotYetValid(nowUnix int64) bool {
	return nowUnix < g.FromTS
}

// GrantDoor associates a grant with a door
type GrantDoor struct {
	GrantID uuid.UUID `db:"grant_id"`
	DoorID  uuid.UUID `db:"door_id"`
}

// DoorGrantCache represents a grant entry cached on a door
type DoorGrantCache struct {
	DoorID        uuid.UUID `json:"door_id" db:"door_id"`
	GrantID       uuid.UUID `json:"grant_id" db:"grant_id"`
	KeyID         uuid.UUID `json:"key_id" db:"key_id"` // = user_id
	FromTS        int64     `json:"from_ts" db:"from_ts"`
	ToTS          int64     `json:"to_ts" db:"to_ts"`
	SecretDoorEnc []byte    `json:"-" db:"secret_door_enc"`
	PushSeq       int64     `json:"push_seq" db:"push_seq"`
	PushedAt      time.Time `json:"pushed_at" db:"pushed_at"`
}
