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

var ErrUserNotFound = errors.New("user not found")

// UserRepository handles user data access
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new user repository
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create inserts a new user
func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
	query := `
		INSERT INTO users (user_id, email, password_hash, name, phone, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	now := time.Now()
	user.CreatedAt = now
	user.UpdatedAt = now

	_, err := r.pool.Exec(ctx, query,
		user.UserID,
		user.Email,
		user.PasswordHash,
		user.Name,
		user.Phone,
		user.Status,
		user.CreatedAt,
		user.UpdatedAt,
	)
	return err
}

// FindByID retrieves a user by ID
func (r *UserRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT user_id, email, password_hash, name, phone, status, created_at, updated_at
		FROM users
		WHERE user_id = $1
	`
	var user domain.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.UserID,
		&user.Email,
		&user.PasswordHash,
		&user.Name,
		&user.Phone,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmail retrieves a user by email
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT user_id, email, password_hash, name, phone, status, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1)
	`
	var user domain.User
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.UserID,
		&user.Email,
		&user.PasswordHash,
		&user.Name,
		&user.Phone,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindAll retrieves all users
func (r *UserRepository) FindAll(ctx context.Context) ([]domain.User, error) {
	query := `
		SELECT user_id, email, password_hash, name, phone, status, created_at, updated_at
		FROM users
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var user domain.User
		if err := rows.Scan(
			&user.UserID,
			&user.Email,
			&user.PasswordHash,
			&user.Name,
			&user.Phone,
			&user.Status,
			&user.CreatedAt,
			&user.UpdatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

// Update updates a user's information
func (r *UserRepository) Update(ctx context.Context, user *domain.User) error {
	query := `
		UPDATE users
		SET email = $2, name = $3, phone = $4, status = $5, updated_at = $6
		WHERE user_id = $1
	`
	user.UpdatedAt = time.Now()
	_, err := r.pool.Exec(ctx, query,
		user.UserID,
		user.Email,
		user.Name,
		user.Phone,
		user.Status,
		user.UpdatedAt,
	)
	return err
}

// EmailExists checks if an email is already registered
func (r *UserRepository) EmailExists(ctx context.Context, email string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))`
	var exists bool
	err := r.pool.QueryRow(ctx, query, email).Scan(&exists)
	return exists, err
}
