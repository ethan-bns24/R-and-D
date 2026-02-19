-- ============================================
-- GRMS Database Schema
-- Migration: 001_initial_schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS (Guests)
-- ============================================
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- ============================================
-- STAFF USERS (Accueil, Admin)
-- ============================================
CREATE TABLE staff_users (
    staff_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('staff', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_email ON staff_users(email);

-- ============================================
-- ROOMS
-- ============================================
CREATE TABLE rooms (
    room_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(255),
    floor INTEGER,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance', 'locked')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_number ON rooms(room_number);
CREATE INDEX idx_rooms_status ON rooms(status);

-- ============================================
-- DOORS (une room peut avoir plusieurs portes)
-- ============================================
CREATE TABLE doors (
    door_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(room_id) ON DELETE CASCADE,
    ble_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'locked')),
    locked_until TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    fw_version VARCHAR(50),
    capabilities JSONB DEFAULT '{"ble": true, "uwb": false, "bg_unlock": false}',
    last_sync_seq BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doors_room ON doors(room_id);
CREATE INDEX idx_doors_ble ON doors(ble_id);
CREATE INDEX idx_doors_status ON doors(status);

-- ============================================
-- ACCESS GRANTS (droits d'accès temporels)
-- ============================================
CREATE TABLE access_grants (
    grant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    secret_base_enc BYTEA NOT NULL,
    from_ts BIGINT NOT NULL,
    to_ts BIGINT NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_by_staff_id UUID REFERENCES staff_users(staff_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by_staff_id UUID REFERENCES staff_users(staff_id)
);

CREATE INDEX idx_grants_user ON access_grants(user_id);
CREATE INDEX idx_grants_status ON access_grants(status);
CREATE INDEX idx_grants_validity ON access_grants(from_ts, to_ts);

-- ============================================
-- GRANT_DOORS (association grant <-> portes)
-- ============================================
CREATE TABLE grant_doors (
    grant_id UUID REFERENCES access_grants(grant_id) ON DELETE CASCADE,
    door_id UUID REFERENCES doors(door_id) ON DELETE CASCADE,
    PRIMARY KEY (grant_id, door_id)
);

CREATE INDEX idx_grant_doors_door ON grant_doors(door_id);

-- ============================================
-- DOOR_GRANTS_CACHE (cache sync DoorLink)
-- ============================================
CREATE TABLE door_grants_cache (
    door_id UUID REFERENCES doors(door_id) ON DELETE CASCADE,
    grant_id UUID REFERENCES access_grants(grant_id) ON DELETE CASCADE,
    key_id UUID NOT NULL,
    from_ts BIGINT NOT NULL,
    to_ts BIGINT NOT NULL,
    secret_door_enc BYTEA NOT NULL,
    push_seq BIGINT NOT NULL,
    pushed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (door_id, grant_id)
);

-- ============================================
-- ACCESS EVENTS (logs d'accès)
-- ============================================
CREATE TABLE access_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    door_id UUID REFERENCES doors(door_id),
    grant_id UUID REFERENCES access_grants(grant_id),
    user_id UUID REFERENCES users(user_id),
    result VARCHAR(50) NOT NULL CHECK (result IN ('success', 'fail')),
    error_code INTEGER DEFAULT 0,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_door ON access_events(door_id);
CREATE INDEX idx_events_user ON access_events(user_id);
CREATE INDEX idx_events_ts ON access_events(ts);
CREATE INDEX idx_events_result ON access_events(result);

-- ============================================
-- AUDIT LOG (traçabilité actions)
-- ============================================
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT NOW(),
    actor_type VARCHAR(50) NOT NULL,
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    payload JSONB,
    ip_address INET
);

CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_action ON audit_log(action);

-- ============================================
-- RESERVATIONS (optionnel, compat legacy)
-- ============================================
CREATE TABLE reservations (
    reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id),
    room_id UUID REFERENCES rooms(room_id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_room ON reservations(room_id);
CREATE INDEX idx_reservations_dates ON reservations(start_date, end_date);

-- ============================================
-- SEQUENCES
-- ============================================
CREATE SEQUENCE door_sync_seq START 1;

-- ============================================
-- SEED DATA (démo)
-- ============================================

-- Staff admin
INSERT INTO staff_users (email, password_hash, name, role) VALUES
('admin@hotel.com', '$2a$10$rQnM1JxJ9j5V5Y5Z5Y5Z5OeQx1J9j5V5Y5Z5Y5Z5OeQx1J9j5V5Y5', 'Admin Hotel', 'admin'),
('accueil@hotel.com', '$2a$10$rQnM1JxJ9j5V5Y5Z5Y5Z5OeQx1J9j5V5Y5Z5Y5Z5OeQx1J9j5V5Y5', 'Reception', 'staff');

-- Rooms
INSERT INTO rooms (room_number, label, floor, status) VALUES
('101', 'Chambre Standard', 1, 'available'),
('102', 'Chambre Standard', 1, 'available'),
('201', 'Suite Junior', 2, 'available'),
('202', 'Suite Deluxe', 2, 'available');

-- Doors (une par room)
INSERT INTO doors (room_id, ble_id, status, fw_version, capabilities)
SELECT room_id, 'BLE-' || room_number, 'offline', '1.0.0', '{"ble": true, "uwb": false, "bg_unlock": false}'
FROM rooms;

-- Demo users
INSERT INTO users (email, password_hash, name, phone, status) VALUES
('ethan@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Ethan', NULL, 'active'),
('lucas@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Lucas', NULL, 'active');
