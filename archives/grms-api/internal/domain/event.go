package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AccessEvent records a door access attempt
type AccessEvent struct {
	EventID   uuid.UUID       `json:"event_id" db:"event_id"`
	TS        time.Time       `json:"ts" db:"ts"`
	DoorID    uuid.UUID       `json:"door_id" db:"door_id"`
	GrantID   uuid.UUID       `json:"grant_id" db:"grant_id"`
	UserID    uuid.UUID       `json:"user_id" db:"user_id"`
	Result    string          `json:"result" db:"result"` // "success" or "fail"
	ErrCode   int             `json:"error_code" db:"error_code"`
	Meta      json.RawMessage `json:"meta,omitempty" db:"meta"`
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
}

// EventResult constants
const (
	EventResultSuccess = "success"
	EventResultFail    = "fail"
)

// BLE Error codes (from spec)
const (
	ErrCodeOK           = 0x0000
	ErrCodeUnknownKey   = 0x0001
	ErrCodeGrantExpired = 0x0002
	ErrCodeNotYetValid  = 0x0003
	ErrCodeNonceTimeout = 0x0004
	ErrCodeNonceReused  = 0x0005
	ErrCodeHMACInvalid  = 0x0006
	ErrCodeRateLimit    = 0x0007
	ErrCodeDoorBusy     = 0x0008
	ErrCodeInternal     = 0x0009
	ErrCodeUWBRequired  = 0x0100
	ErrCodeUWBTimeout   = 0x0101
	ErrCodeUWBTooFar    = 0x0102
	ErrCodeUWBLowQual   = 0x0103
)

// ErrorCodeName returns a human-readable name for an error code
func ErrorCodeName(code int) string {
	names := map[int]string{
		ErrCodeOK:           "OK",
		ErrCodeUnknownKey:   "UNKNOWN_KEY",
		ErrCodeGrantExpired: "GRANT_EXPIRED",
		ErrCodeNotYetValid:  "NOT_YET_VALID",
		ErrCodeNonceTimeout: "NONCE_TIMEOUT",
		ErrCodeNonceReused:  "NONCE_REUSED",
		ErrCodeHMACInvalid:  "HMAC_INVALID",
		ErrCodeRateLimit:    "RATE_LIMIT",
		ErrCodeDoorBusy:     "DOOR_BUSY",
		ErrCodeInternal:     "INTERNAL_ERROR",
		ErrCodeUWBRequired:  "UWB_REQUIRED",
		ErrCodeUWBTimeout:   "UWB_TIMEOUT",
		ErrCodeUWBTooFar:    "UWB_TOO_FAR",
		ErrCodeUWBLowQual:   "UWB_LOW_QUALITY",
	}
	if name, ok := names[code]; ok {
		return name
	}
	return "UNKNOWN"
}

// AuditLog records staff actions for compliance
type AuditLog struct {
	ID           int64           `json:"id" db:"id"`
	TS           time.Time       `json:"ts" db:"ts"`
	ActorType    string          `json:"actor_type" db:"actor_type"` // "staff", "system", "door"
	ActorID      *uuid.UUID      `json:"actor_id,omitempty" db:"actor_id"`
	Action       string          `json:"action" db:"action"`
	ResourceType string          `json:"resource_type,omitempty" db:"resource_type"`
	ResourceID   *uuid.UUID      `json:"resource_id,omitempty" db:"resource_id"`
	Payload      json.RawMessage `json:"payload,omitempty" db:"payload"`
	IPAddress    *string         `json:"ip_address,omitempty" db:"ip_address"`
}

// Common audit actions
const (
	AuditActionGrantCreated  = "grant_created"
	AuditActionGrantRevoked  = "grant_revoked"
	AuditActionDoorUnlocked  = "door_unlocked"
	AuditActionDoorLocked    = "door_locked"
	AuditActionUserCreated   = "user_created"
	AuditActionStaffLogin    = "staff_login"
	AuditActionAccessAttempt = "access_attempt"
)
