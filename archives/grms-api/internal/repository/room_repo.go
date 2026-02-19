package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"grms-backend/internal/domain"
)

var ErrRoomNotFound = errors.New("room not found")

// RoomRepository handles room data access
type RoomRepository struct {
	pool *pgxpool.Pool
}

// NewRoomRepository creates a new room repository
func NewRoomRepository(pool *pgxpool.Pool) *RoomRepository {
	return &RoomRepository{pool: pool}
}

// FindByID retrieves a room by ID
func (r *RoomRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Room, error) {
	query := `
		SELECT room_id, room_number, label, floor, status, created_at
		FROM rooms
		WHERE room_id = $1
	`
	var room domain.Room
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&room.RoomID,
		&room.RoomNumber,
		&room.Label,
		&room.Floor,
		&room.Status,
		&room.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoomNotFound
	}
	if err != nil {
		return nil, err
	}
	return &room, nil
}

// FindByNumber retrieves a room by room number
func (r *RoomRepository) FindByNumber(ctx context.Context, number string) (*domain.Room, error) {
	query := `
		SELECT room_id, room_number, label, floor, status, created_at
		FROM rooms
		WHERE room_number = $1
	`
	var room domain.Room
	err := r.pool.QueryRow(ctx, query, number).Scan(
		&room.RoomID,
		&room.RoomNumber,
		&room.Label,
		&room.Floor,
		&room.Status,
		&room.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoomNotFound
	}
	if err != nil {
		return nil, err
	}
	return &room, nil
}

// FindAll retrieves all rooms
func (r *RoomRepository) FindAll(ctx context.Context) ([]domain.Room, error) {
	query := `
		SELECT room_id, room_number, label, floor, status, created_at
		FROM rooms
		ORDER BY room_number
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []domain.Room
	for rows.Next() {
		var room domain.Room
		if err := rows.Scan(
			&room.RoomID,
			&room.RoomNumber,
			&room.Label,
			&room.Floor,
			&room.Status,
			&room.CreatedAt,
		); err != nil {
			return nil, err
		}
		rooms = append(rooms, room)
	}
	return rooms, nil
}

// UpdateStatus updates a room's status
func (r *RoomRepository) UpdateStatus(ctx context.Context, roomID uuid.UUID, status string) error {
	query := `UPDATE rooms SET status = $2 WHERE room_id = $1`
	_, err := r.pool.Exec(ctx, query, roomID, status)
	return err
}

// FindAvailable retrieves all available rooms
func (r *RoomRepository) FindAvailable(ctx context.Context) ([]domain.Room, error) {
	query := `
		SELECT room_id, room_number, label, floor, status, created_at
		FROM rooms
		WHERE status = 'available'
		ORDER BY room_number
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []domain.Room
	for rows.Next() {
		var room domain.Room
		if err := rows.Scan(
			&room.RoomID,
			&room.RoomNumber,
			&room.Label,
			&room.Floor,
			&room.Status,
			&room.CreatedAt,
		); err != nil {
			return nil, err
		}
		rooms = append(rooms, room)
	}
	return rooms, nil
}
