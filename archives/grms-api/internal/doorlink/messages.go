package doorlink

import "encoding/base64"

// BaseMessage is used to determine message type
type BaseMessage struct {
	Type string `json:"type"`
}

// ===== Door -> Server Messages =====

// HelloMessage is sent by door on connection
type HelloMessage struct {
	Type         string          `json:"type"`
	DoorID       string          `json:"door_id"`
	FWVersion    string          `json:"fw_version"`
	Capabilities map[string]bool `json:"capabilities"`
	LastSyncSeq  int64           `json:"last_sync_seq"`
	DoorTime     int64           `json:"door_time"`
}

// AckMessage confirms receipt of grants
type AckMessage struct {
	Type   string `json:"type"`
	Seq    int64  `json:"seq"`
	DoorID string `json:"door_id"`
}

// AccessEventMessage reports an access attempt
type AccessEventMessage struct {
	Type      string                 `json:"type"`
	EventID   string                 `json:"event_id"`
	TS        int64                  `json:"ts"`
	DoorID    string                 `json:"door_id"`
	Result    string                 `json:"result"`
	ErrorCode int                    `json:"error_code"`
	KeyID     string                 `json:"key_id"`
	GrantID   string                 `json:"grant_id"`
	Meta      map[string]interface{} `json:"meta,omitempty"`
}

// ===== Server -> Door Messages =====

// WelcomeMessage is sent in response to Hello
type WelcomeMessage struct {
	Type          string   `json:"type"`
	ServerTime    int64    `json:"server_time"`
	ConfigVersion int      `json:"config_version"`
	Sync          SyncInfo `json:"sync"`
}

// SyncInfo describes the sync mode
type SyncInfo struct {
	Mode    string `json:"mode"` // "full" or "delta"
	FromSeq int64  `json:"from_seq"`
}

// GrantReplaceMessage sends a full snapshot of grants
type GrantReplaceMessage struct {
	Type   string       `json:"type"`
	Seq    int64        `json:"seq"`
	DoorID string       `json:"door_id"`
	Grants []GrantEntry `json:"grants"`
}

// GrantDeltaMessage sends incremental grant changes
type GrantDeltaMessage struct {
	Type   string             `json:"type"`
	Seq    int64              `json:"seq"`
	DoorID string             `json:"door_id"`
	Add    []GrantEntry       `json:"add,omitempty"`
	Remove []GrantRemoveEntry `json:"remove,omitempty"`
}

// GrantEntry represents a grant to push to a door
type GrantEntry struct {
	KeyID         string `json:"key_id"`
	GrantID       string `json:"grant_id"`
	FromTS        int64  `json:"from_ts"`
	ToTS          int64  `json:"to_ts"`
	SecretDoorB64 string `json:"secret_door_b64"`
}

// GrantRemoveEntry specifies a grant to remove
type GrantRemoveEntry struct {
	GrantID string `json:"grant_id"`
}

// Helper to encode bytes to base64
func encodeBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}
