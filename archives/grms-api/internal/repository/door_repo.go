package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"grms-backend/internal/domain"
)

var ErrDoorNotFound = errors.New("door not found")

// DoorRepository handles door data access
type DoorRepository struct {
	pool *pgxpool.Pool
}

// NewDoorRepository creates a new door repository
func NewDoorRepository(pool *pgxpool.Pool) *DoorRepository {
	return &DoorRepository{pool: pool}
}

// FindByID retrieves a door by ID
func (r *DoorRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Door, error) {
	query := `
		SELECT door_id, room_id, ble_id, status, locked_until, last_seen_at, 
		       fw_version, capabilities, last_sync_seq, created_at
		FROM doors
		WHERE door_id = $1
	`
	var door domain.Door
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&door.DoorID,
		&door.RoomID,
		&door.BleID,
		&door.Status,
		&door.LockedUntil,
		&door.LastSeenAt,
		&door.FWVersion,
		&door.Capabilities,
		&door.LastSyncSeq,
		&door.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDoorNotFound
	}
	if err != nil {
		return nil, err
	}
	return &door, nil
}

// FindByRoomID retrieves all doors for a room
func (r *DoorRepository) FindByRoomID(ctx context.Context, roomID uuid.UUID) ([]domain.Door, error) {
	query := `
		SELECT door_id, room_id, ble_id, status, locked_until, last_seen_at, 
		       fw_version, capabilities, last_sync_seq, created_at
		FROM doors
		WHERE room_id = $1
	`
	rows, err := r.pool.Query(ctx, query, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var doors []domain.Door
	for rows.Next() {
		var door domain.Door
		if err := rows.Scan(
			&door.DoorID,
			&door.RoomID,
			&door.BleID,
			&door.Status,
			&door.LockedUntil,
			&door.LastSeenAt,
			&door.FWVersion,
			&door.Capabilities,
			&door.LastSyncSeq,
			&door.CreatedAt,
		); err != nil {
			return nil, err
		}
		doors = append(doors, door)
	}
	return doors, nil
}

// FindByBleID retrieves a door by its BLE identifier
func (r *DoorRepository) FindByBleID(ctx context.Context, bleID string) (*domain.Door, error) {
	query := `
		SELECT door_id, room_id, ble_id, status, locked_until, last_seen_at, 
		       fw_version, capabilities, last_sync_seq, created_at
		FROM doors
		WHERE ble_id = $1
	`
	var door domain.Door
	err := r.pool.QueryRow(ctx, query, bleID).Scan(
		&door.DoorID,
		&door.RoomID,
		&door.BleID,
		&door.Status,
		&door.LockedUntil,
		&door.LastSeenAt,
		&door.FWVersion,
		&door.Capabilities,
		&door.LastSyncSeq,
		&door.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDoorNotFound
	}
	if err != nil {
		return nil, err
	}
	return &door, nil
}

// FindAll retrieves all doors
func (r *DoorRepository) FindAll(ctx context.Context) ([]domain.Door, error) {
	query := `
		SELECT door_id, room_id, ble_id, status, locked_until, last_seen_at, 
		       fw_version, capabilities, last_sync_seq, created_at
		FROM doors
		ORDER BY created_at
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var doors []domain.Door
	for rows.Next() {
		var door domain.Door
		if err := rows.Scan(
			&door.DoorID,
			&door.RoomID,
			&door.BleID,
			&door.Status,
			&door.LockedUntil,
			&door.LastSeenAt,
			&door.FWVersion,
			&door.Capabilities,
			&door.LastSyncSeq,
			&door.CreatedAt,
		); err != nil {
			return nil, err
		}
		doors = append(doors, door)
	}
	return doors, nil
}

// UpdateStatus updates a door's connection status
func (r *DoorRepository) UpdateStatus(ctx context.Context, doorID uuid.UUID, status string, lastSeenAt *time.Time) error {
	query := `
		UPDATE doors 
		SET status = $2, last_seen_at = $3
		WHERE door_id = $1
	`
	_, err := r.pool.Exec(ctx, query, doorID, status, lastSeenAt)
	return err
}

// UpdateSyncSeq updates the last sync sequence for a door
func (r *DoorRepository) UpdateSyncSeq(ctx context.Context, doorID uuid.UUID, seq int64) error {
	query := `UPDATE doors SET last_sync_seq = $2 WHERE door_id = $1`
	_, err := r.pool.Exec(ctx, query, doorID, seq)
	return err
}

// Lock sets a door to locked status until a given time
func (r *DoorRepository) Lock(ctx context.Context, doorID uuid.UUID, until time.Time) error {
	query := `UPDATE doors SET status = 'locked', locked_until = $2 WHERE door_id = $1`
	_, err := r.pool.Exec(ctx, query, doorID, until)
	return err
}

// Unlock removes the locked status from a door
func (r *DoorRepository) Unlock(ctx context.Context, doorID uuid.UUID) error {
	query := `UPDATE doors SET status = 'offline', locked_until = NULL WHERE door_id = $1`
	_, err := r.pool.Exec(ctx, query, doorID)
	return err
}
