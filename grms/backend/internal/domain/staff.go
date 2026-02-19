package domain

import (
	"time"

	"github.com/google/uuid"
)

// StaffRole defines staff permission levels
type StaffRole string

const (
	RoleStaff StaffRole = "staff"
	RoleAdmin StaffRole = "admin"
)

// Staff represents a hotel staff member
type Staff struct {
	StaffID      uuid.UUID `json:"staff_id" db:"staff_id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Name         string    `json:"name" db:"name"`
	Role         StaffRole `json:"role" db:"role"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// IsAdmin returns true if the staff has admin privileges
func (s *Staff) IsAdmin() bool {
	return s.Role == RoleAdmin
}

// CanAssignRooms returns true if the staff can assign rooms
func (s *Staff) CanAssignRooms() bool {
	return s.Role == RoleStaff || s.Role == RoleAdmin
}

// ToPublic returns staff without sensitive fields
func (s *Staff) ToPublic() map[string]interface{} {
	return map[string]interface{}{
		"staff_id":   s.StaffID,
		"email":      s.Email,
		"name":       s.Name,
		"role":       s.Role,
		"created_at": s.CreatedAt,
	}
}
