package domain

import (
	"time"

	"github.com/google/uuid"
)

// User represents a guest/client account
type User struct {
	UserID       uuid.UUID `json:"user_id" db:"user_id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Name         string    `json:"name" db:"name"`
	Phone        *string   `json:"phone,omitempty" db:"phone"`
	Status       string    `json:"status" db:"status"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// IsActive returns true if the user account is active
func (u *User) IsActive() bool {
	return u.Status == "active"
}

// ToPublic returns a user without sensitive fields
func (u *User) ToPublic() map[string]interface{} {
	return map[string]interface{}{
		"user_id":    u.UserID,
		"email":      u.Email,
		"name":       u.Name,
		"phone":      u.Phone,
		"status":     u.Status,
		"created_at": u.CreatedAt,
	}
}
