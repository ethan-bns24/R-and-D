package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"grms-backend/internal/domain"
)

// EventRepository handles access event data access
type EventRepository struct {
	pool *pgxpool.Pool
}

// NewEventRepository creates a new event repository
func NewEventRepository(pool *pgxpool.Pool) *EventRepository {
	return &EventRepository{pool: pool}
}

// Create inserts a new access event
func (r *EventRepository) Create(ctx context.Context, event *domain.AccessEvent) error {
	query := `
		INSERT INTO access_events (event_id, ts, door_id, grant_id, user_id, result, error_code, meta, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	event.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx, query,
		event.EventID,
		event.TS,
		event.DoorID,
		event.GrantID,
		event.UserID,
		event.Result,
		event.ErrCode,
		event.Meta,
		event.CreatedAt,
	)
	return err
}

// FindByDoorID retrieves events for a specific door
func (r *EventRepository) FindByDoorID(ctx context.Context, doorID uuid.UUID, limit int) ([]domain.AccessEvent, error) {
	query := `
		SELECT event_id, ts, door_id, grant_id, user_id, result, error_code, meta, created_at
		FROM access_events
		WHERE door_id = $1
		ORDER BY ts DESC
		LIMIT $2
	`
	return r.queryEvents(ctx, query, doorID, limit)
}

// FindByUserID retrieves events for a specific user
func (r *EventRepository) FindByUserID(ctx context.Context, userID uuid.UUID, limit int) ([]domain.AccessEvent, error) {
	query := `
		SELECT event_id, ts, door_id, grant_id, user_id, result, error_code, meta, created_at
		FROM access_events
		WHERE user_id = $1
		ORDER BY ts DESC
		LIMIT $2
	`
	return r.queryEvents(ctx, query, userID, limit)
}

// FindRecent retrieves recent events
func (r *EventRepository) FindRecent(ctx context.Context, limit int) ([]domain.AccessEvent, error) {
	query := `
		SELECT event_id, ts, door_id, grant_id, user_id, result, error_code, meta, created_at
		FROM access_events
		ORDER BY ts DESC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.AccessEvent
	for rows.Next() {
		var event domain.AccessEvent
		if err := rows.Scan(
			&event.EventID,
			&event.TS,
			&event.DoorID,
			&event.GrantID,
			&event.UserID,
			&event.Result,
			&event.ErrCode,
			&event.Meta,
			&event.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

// Query retrieves events with filters (for backoffice)
func (r *EventRepository) Query(ctx context.Context, doorID *uuid.UUID, fromTS, toTS *int64, limit int) ([]map[string]interface{}, error) {
	// Build dynamic query
	query := `
		SELECT e.event_id, e.ts, e.door_id, e.grant_id, e.user_id, e.result, e.error_code, e.meta,
		       u.name as user_name, d.ble_id, rm.room_number
		FROM access_events e
		LEFT JOIN users u ON e.user_id = u.user_id
		LEFT JOIN doors d ON e.door_id = d.door_id
		LEFT JOIN rooms rm ON d.room_id = rm.room_id
		WHERE 1=1
	`
	args := []interface{}{}
	argIndex := 1

	if doorID != nil {
		query += " AND e.door_id = $" + string(rune('0'+argIndex))
		args = append(args, *doorID)
		argIndex++
	}

	query += " ORDER BY e.ts DESC LIMIT $" + string(rune('0'+argIndex))
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var (
			eventID    uuid.UUID
			ts         time.Time
			doorIDVal  uuid.UUID
			grantID    uuid.UUID
			userID     uuid.UUID
			result     string
			errorCode  int
			meta       json.RawMessage
			userName   *string
			bleID      *string
			roomNumber *string
		)
		if err := rows.Scan(
			&eventID, &ts, &doorIDVal, &grantID, &userID, &result, &errorCode, &meta,
			&userName, &bleID, &roomNumber,
		); err != nil {
			return nil, err
		}

		results = append(results, map[string]interface{}{
			"event_id":    eventID,
			"ts":          ts,
			"door_id":     doorIDVal,
			"grant_id":    grantID,
			"user_id":     userID,
			"result":      result,
			"error_code":  errorCode,
			"meta":        meta,
			"user_name":   userName,
			"ble_id":      bleID,
			"room_number": roomNumber,
		})
	}
	return results, nil
}

func (r *EventRepository) queryEvents(ctx context.Context, query string, args ...interface{}) ([]domain.AccessEvent, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.AccessEvent
	for rows.Next() {
		var event domain.AccessEvent
		if err := rows.Scan(
			&event.EventID,
			&event.TS,
			&event.DoorID,
			&event.GrantID,
			&event.UserID,
			&event.Result,
			&event.ErrCode,
			&event.Meta,
			&event.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}
