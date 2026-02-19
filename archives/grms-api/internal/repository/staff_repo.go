package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"grms-backend/internal/domain"
)

var ErrStaffNotFound = errors.New("staff not found")

// StaffRepository handles staff data access
type StaffRepository struct {
	pool *pgxpool.Pool
}

// NewStaffRepository creates a new staff repository
func NewStaffRepository(pool *pgxpool.Pool) *StaffRepository {
	return &StaffRepository{pool: pool}
}

// FindByID retrieves a staff member by ID
func (r *StaffRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Staff, error) {
	query := `
		SELECT staff_id, email, password_hash, name, role, created_at, updated_at
		FROM staff_users
		WHERE staff_id = $1
	`
	var staff domain.Staff
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&staff.StaffID,
		&staff.Email,
		&staff.PasswordHash,
		&staff.Name,
		&staff.Role,
		&staff.CreatedAt,
		&staff.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrStaffNotFound
	}
	if err != nil {
		return nil, err
	}
	return &staff, nil
}

// FindByEmail retrieves a staff member by email
func (r *StaffRepository) FindByEmail(ctx context.Context, email string) (*domain.Staff, error) {
	query := `
		SELECT staff_id, email, password_hash, name, role, created_at, updated_at
		FROM staff_users
		WHERE LOWER(email) = LOWER($1)
	`
	var staff domain.Staff
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&staff.StaffID,
		&staff.Email,
		&staff.PasswordHash,
		&staff.Name,
		&staff.Role,
		&staff.CreatedAt,
		&staff.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrStaffNotFound
	}
	if err != nil {
		return nil, err
	}
	return &staff, nil
}

// FindAll retrieves all staff members
func (r *StaffRepository) FindAll(ctx context.Context) ([]domain.Staff, error) {
	query := `
		SELECT staff_id, email, password_hash, name, role, created_at, updated_at
		FROM staff_users
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var staffList []domain.Staff
	for rows.Next() {
		var staff domain.Staff
		if err := rows.Scan(
			&staff.StaffID,
			&staff.Email,
			&staff.PasswordHash,
			&staff.Name,
			&staff.Role,
			&staff.CreatedAt,
			&staff.UpdatedAt,
		); err != nil {
			return nil, err
		}
		staffList = append(staffList, staff)
	}
	return staffList, nil
}
