package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"grms-backend/internal/domain"
	"grms-backend/internal/repository"
)

// DoorService handles door-related operations
type DoorService struct {
	doorRepo  *repository.DoorRepository
	roomRepo  *repository.RoomRepository
	auditRepo *repository.AuditRepository
}

// NewDoorService creates a new door service
func NewDoorService(
	doorRepo *repository.DoorRepository,
	roomRepo *repository.RoomRepository,
	auditRepo *repository.AuditRepository,
) *DoorService {
	return &DoorService{
		doorRepo:  doorRepo,
		roomRepo:  roomRepo,
		auditRepo: auditRepo,
	}
}

// DoorStatus represents door status for API responses
type DoorStatus struct {
	DoorID       uuid.UUID               `json:"door_id"`
	RoomNumber   string                  `json:"room_number,omitempty"`
	BleID        string                  `json:"ble_id"`
	Status       string                  `json:"status"`
	IsOnline     bool                    `json:"is_online"`
	IsLocked     bool                    `json:"is_locked"`
	LockedUntil  *time.Time              `json:"locked_until,omitempty"`
	LastSeenAt   *time.Time              `json:"last_seen_at,omitempty"`
	FWVersion    string                  `json:"fw_version"`
	Capabilities domain.DoorCapabilities `json:"capabilities"`
}

// GetAllDoors retrieves status of all doors
func (s *DoorService) GetAllDoors(ctx context.Context) ([]DoorStatus, error) {
	doors, err := s.doorRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}

	var statuses []DoorStatus
	for _, door := range doors {
		status := DoorStatus{
			DoorID:       door.DoorID,
			BleID:        door.BleID,
			Status:       door.Status,
			IsOnline:     door.IsOnline(),
			IsLocked:     door.IsLocked(),
			LockedUntil:  door.LockedUntil,
			LastSeenAt:   door.LastSeenAt,
			FWVersion:    door.FWVersion,
			Capabilities: door.GetCapabilities(),
		}

		// Get room number if available
		if door.RoomID != nil {
			room, err := s.roomRepo.FindByID(ctx, *door.RoomID)
			if err == nil {
				status.RoomNumber = room.RoomNumber
			}
		}

		statuses = append(statuses, status)
	}

	return statuses, nil
}

// GetDoorByID retrieves a specific door
func (s *DoorService) GetDoorByID(ctx context.Context, doorID uuid.UUID) (*DoorStatus, error) {
	door, err := s.doorRepo.FindByID(ctx, doorID)
	if err != nil {
		return nil, err
	}

	status := &DoorStatus{
		DoorID:       door.DoorID,
		BleID:        door.BleID,
		Status:       door.Status,
		IsOnline:     door.IsOnline(),
		IsLocked:     door.IsLocked(),
		LockedUntil:  door.LockedUntil,
		LastSeenAt:   door.LastSeenAt,
		FWVersion:    door.FWVersion,
		Capabilities: door.GetCapabilities(),
	}

	if door.RoomID != nil {
		room, err := s.roomRepo.FindByID(ctx, *door.RoomID)
		if err == nil {
			status.RoomNumber = room.RoomNumber
		}
	}

	return status, nil
}

// LockDoor locks a door for a duration (e.g., after intrusion attempt)
func (s *DoorService) LockDoor(ctx context.Context, doorID uuid.UUID, duration time.Duration, staffID uuid.UUID) error {
	until := time.Now().Add(duration)
	if err := s.doorRepo.Lock(ctx, doorID, until); err != nil {
		return err
	}

	s.auditRepo.Log(ctx, "staff", staffID, domain.AuditActionDoorLocked, "door", doorID, map[string]interface{}{
		"locked_until": until,
		"duration_min": duration.Minutes(),
	})

	return nil
}

// UnlockDoor removes lock from a door
func (s *DoorService) UnlockDoor(ctx context.Context, doorID uuid.UUID, staffID uuid.UUID) error {
	if err := s.doorRepo.Unlock(ctx, doorID); err != nil {
		return err
	}

	s.auditRepo.Log(ctx, "staff", staffID, domain.AuditActionDoorUnlocked, "door", doorID, nil)

	return nil
}

// UpdateDoorStatus updates a door's connection status (called by DoorLink)
func (s *DoorService) UpdateDoorStatus(ctx context.Context, doorID uuid.UUID, status string) error {
	now := time.Now()
	return s.doorRepo.UpdateStatus(ctx, doorID, status, &now)
}
