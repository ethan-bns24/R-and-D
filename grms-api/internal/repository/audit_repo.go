package repository

import (
	"context"
	"encoding/json"
	"net"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"grms-backend/internal/domain"
)

// AuditRepository handles audit log data access
type AuditRepository struct {
	pool *pgxpool.Pool
}

// NewAuditRepository creates a new audit repository
func NewAuditRepository(pool *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

// Log records an audit entry
func (r *AuditRepository) Log(ctx context.Context, actorType string, actorID uuid.UUID, action, resourceType string, resourceID uuid.UUID, payload map[string]interface{}) error {
	query := `
		INSERT INTO audit_log (ts, actor_type, actor_id, action, resource_type, resource_id, payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	var payloadJSON []byte
	if payload != nil {
		payloadJSON, _ = json.Marshal(payload)
	}

	_, err := r.pool.Exec(ctx, query,
		time.Now(),
		actorType,
		actorID,
		action,
		resourceType,
		resourceID,
		payloadJSON,
	)
	return err
}

// LogWithIP records an audit entry with IP address
func (r *AuditRepository) LogWithIP(ctx context.Context, actorType string, actorID uuid.UUID, action, resourceType string, resourceID uuid.UUID, payload map[string]interface{}, ip string) error {
	query := `
		INSERT INTO audit_log (ts, actor_type, actor_id, action, resource_type, resource_id, payload, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	var payloadJSON []byte
	if payload != nil {
		payloadJSON, _ = json.Marshal(payload)
	}

	var ipAddr *net.IP
	if ip != "" {
		parsed := net.ParseIP(ip)
		ipAddr = &parsed
	}

	_, err := r.pool.Exec(ctx, query,
		time.Now(),
		actorType,
		actorID,
		action,
		resourceType,
		resourceID,
		payloadJSON,
		ipAddr,
	)
	return err
}

// FindByActor retrieves audit logs for a specific actor
func (r *AuditRepository) FindByActor(ctx context.Context, actorType string, actorID uuid.UUID, limit int) ([]domain.AuditLog, error) {
	query := `
		SELECT id, ts, actor_type, actor_id, action, resource_type, resource_id, payload, ip_address
		FROM audit_log
		WHERE actor_type = $1 AND actor_id = $2
		ORDER BY ts DESC
		LIMIT $3
	`
	return r.queryLogs(ctx, query, actorType, actorID, limit)
}

// FindByAction retrieves audit logs for a specific action type
func (r *AuditRepository) FindByAction(ctx context.Context, action string, limit int) ([]domain.AuditLog, error) {
	query := `
		SELECT id, ts, actor_type, actor_id, action, resource_type, resource_id, payload, ip_address
		FROM audit_log
		WHERE action = $1
		ORDER BY ts DESC
		LIMIT $2
	`
	return r.queryLogs(ctx, query, action, limit)
}

// FindRecent retrieves recent audit logs
func (r *AuditRepository) FindRecent(ctx context.Context, limit int) ([]domain.AuditLog, error) {
	query := `
		SELECT id, ts, actor_type, actor_id, action, resource_type, resource_id, payload, ip_address
		FROM audit_log
		ORDER BY ts DESC
		LIMIT $1
	`
	return r.queryLogs(ctx, query, limit)
}

func (r *AuditRepository) queryLogs(ctx context.Context, query string, args ...interface{}) ([]domain.AuditLog, error) {
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []domain.AuditLog
	for rows.Next() {
		var log domain.AuditLog
		var ipStr *string
		if err := rows.Scan(
			&log.ID,
			&log.TS,
			&log.ActorType,
			&log.ActorID,
			&log.Action,
			&log.ResourceType,
			&log.ResourceID,
			&log.Payload,
			&ipStr,
		); err != nil {
			return nil, err
		}
		log.IPAddress = ipStr
		logs = append(logs, log)
	}
	return logs, nil
}
