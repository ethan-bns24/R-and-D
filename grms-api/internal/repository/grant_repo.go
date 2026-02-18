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

var ErrGrantNotFound = errors.New("grant not found")

// GrantRepository handles access grant data access
type GrantRepository struct {
	pool *pgxpool.Pool
}

// NewGrantRepository creates a new grant repository
func NewGrantRepository(pool *pgxpool.Pool) *GrantRepository {
	return &GrantRepository{pool: pool}
}

// Create inserts a new access grant
func (r *GrantRepository) Create(ctx context.Context, grant *domain.AccessGrant) error {
	query := `
		INSERT INTO access_grants (grant_id, user_id, secret_base_enc, from_ts, to_ts, status, created_by_staff_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	grant.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx, query,
		grant.GrantID,
		grant.UserID,
		grant.SecretBaseEnc,
		grant.FromTS,
		grant.ToTS,
		grant.Status,
		grant.CreatedByStaffID,
		grant.CreatedAt,
	)
	return err
}

// FindByID retrieves a grant by ID
func (r *GrantRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.AccessGrant, error) {
	query := `
		SELECT grant_id, user_id, secret_base_enc, from_ts, to_ts, status, 
		       created_by_staff_id, created_at, revoked_at, revoked_by_staff_id
		FROM access_grants
		WHERE grant_id = $1
	`
	var grant domain.AccessGrant
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&grant.GrantID,
		&grant.UserID,
		&grant.SecretBaseEnc,
		&grant.FromTS,
		&grant.ToTS,
		&grant.Status,
		&grant.CreatedByStaffID,
		&grant.CreatedAt,
		&grant.RevokedAt,
		&grant.RevokedByStaffID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGrantNotFound
	}
	if err != nil {
		return nil, err
	}
	return &grant, nil
}

// FindActiveByUserID retrieves all active grants for a user
func (r *GrantRepository) FindActiveByUserID(ctx context.Context, userID uuid.UUID, nowUnix int64) ([]domain.AccessGrant, error) {
	query := `
		SELECT grant_id, user_id, secret_base_enc, from_ts, to_ts, status, 
		       created_by_staff_id, created_at, revoked_at, revoked_by_staff_id
		FROM access_grants
		WHERE user_id = $1 
		  AND status = 'active'
		  AND to_ts >= $2
		ORDER BY from_ts DESC
	`
	rows, err := r.pool.Query(ctx, query, userID, nowUnix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var grants []domain.AccessGrant
	for rows.Next() {
		var grant domain.AccessGrant
		if err := rows.Scan(
			&grant.GrantID,
			&grant.UserID,
			&grant.SecretBaseEnc,
			&grant.FromTS,
			&grant.ToTS,
			&grant.Status,
			&grant.CreatedByStaffID,
			&grant.CreatedAt,
			&grant.RevokedAt,
			&grant.RevokedByStaffID,
		); err != nil {
			return nil, err
		}
		grants = append(grants, grant)
	}
	return grants, nil
}

// Update updates a grant
func (r *GrantRepository) Update(ctx context.Context, grant *domain.AccessGrant) error {
	query := `
		UPDATE access_grants
		SET status = $2, revoked_at = $3, revoked_by_staff_id = $4
		WHERE grant_id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		grant.GrantID,
		grant.Status,
		grant.RevokedAt,
		grant.RevokedByStaffID,
	)
	return err
}

// AddDoor associates a door with a grant
func (r *GrantRepository) AddDoor(ctx context.Context, grantID, doorID uuid.UUID) error {
	query := `INSERT INTO grant_doors (grant_id, door_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
	_, err := r.pool.Exec(ctx, query, grantID, doorID)
	return err
}

// GetDoors retrieves all doors associated with a grant
func (r *GrantRepository) GetDoors(ctx context.Context, grantID uuid.UUID) ([]domain.Door, error) {
	query := `
		SELECT d.door_id, d.room_id, d.ble_id, d.status, d.locked_until, d.last_seen_at, 
		       d.fw_version, d.capabilities, d.last_sync_seq, d.created_at
		FROM doors d
		INNER JOIN grant_doors gd ON d.door_id = gd.door_id
		WHERE gd.grant_id = $1
	`
	rows, err := r.pool.Query(ctx, query, grantID)
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

// UpsertDoorCache inserts or updates a door grant cache entry
func (r *GrantRepository) UpsertDoorCache(ctx context.Context, entry *domain.DoorGrantCache) error {
	query := `
		INSERT INTO door_grants_cache (door_id, grant_id, key_id, from_ts, to_ts, secret_door_enc, push_seq, pushed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (door_id, grant_id) DO UPDATE
		SET from_ts = $4, to_ts = $5, secret_door_enc = $6, push_seq = $7, pushed_at = $8
	`
	entry.PushedAt = time.Now()
	_, err := r.pool.Exec(ctx, query,
		entry.DoorID,
		entry.GrantID,
		entry.KeyID,
		entry.FromTS,
		entry.ToTS,
		entry.SecretDoorEnc,
		entry.PushSeq,
		entry.PushedAt,
	)
	return err
}

// GetDoorCacheEntries retrieves all cached grants for a door
func (r *GrantRepository) GetDoorCacheEntries(ctx context.Context, doorID uuid.UUID) ([]domain.DoorGrantCache, error) {
	query := `
		SELECT door_id, grant_id, key_id, from_ts, to_ts, secret_door_enc, push_seq, pushed_at
		FROM door_grants_cache
		WHERE door_id = $1
	`
	rows, err := r.pool.Query(ctx, query, doorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []domain.DoorGrantCache
	for rows.Next() {
		var entry domain.DoorGrantCache
		if err := rows.Scan(
			&entry.DoorID,
			&entry.GrantID,
			&entry.KeyID,
			&entry.FromTS,
			&entry.ToTS,
			&entry.SecretDoorEnc,
			&entry.PushSeq,
			&entry.PushedAt,
		); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// DeleteDoorCache removes a grant from all door caches
func (r *GrantRepository) DeleteDoorCache(ctx context.Context, grantID uuid.UUID) error {
	query := `DELETE FROM door_grants_cache WHERE grant_id = $1`
	_, err := r.pool.Exec(ctx, query, grantID)
	return err
}

// GetNextSyncSeq returns the next sync sequence number
func (r *GrantRepository) GetNextSyncSeq(ctx context.Context) (int64, error) {
	var seq int64
	err := r.pool.QueryRow(ctx, `SELECT nextval('door_sync_seq')`).Scan(&seq)
	return seq, err
}
