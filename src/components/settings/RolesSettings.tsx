

import React, { useState } from 'react';

// Dummy permissions for demonstration
const ALL_PERMISSIONS = [
  'Pregled korisnika',
  'Upravljanje korisnicima',
  'Pregled izvještaja',
  'Upravljanje postavkama',
  'Pristup dashboardu',
];

// Dummy initial roles
const INITIAL_ROLES = [
  {
    id: 1,
    name: 'Administrator',
    permissions: [
      'Pregled korisnika',
      'Upravljanje korisnicima',
      'Pregled izvještaja',
      'Upravljanje postavkama',
      'Pristup dashboardu',
    ],
  },
  {
    id: 2,
    name: 'Korisnik',
    permissions: [
      'Pregled korisnika',
      'Pristup dashboardu',
    ],
  },
];

type Role = {
  id: number;
  name: string;
  permissions: string[];
};

const RolesSettings: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>(INITIAL_ROLES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

  // Modal open/close
  const openModal = () => {
    setNewRoleName('');
    setNewRolePermissions([]);
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  // Handle form changes
  const handleRoleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewRoleName(e.target.value);
  };
  const handlePermissionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.selectedOptions).map((opt) => opt.value);
    setNewRolePermissions(options);
  };

  // Save new role
  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim() || newRolePermissions.length === 0) return;
    setRoles([
      ...roles,
      {
        id: Date.now(),
        name: newRoleName.trim(),
        permissions: newRolePermissions,
      },
    ]);
    setIsModalOpen(false);
  };

  // Responsive styles for modal and card
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7fafc',
        padding: '32px 8px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
          padding: 32,
          maxWidth: 900,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Upravljanje ulogama i dozvolama
          </h2>
          <button
            onClick={openModal}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: 16,
              cursor: 'pointer',
              marginTop: 12,
              marginLeft: 'auto',
            }}
          >
            + Dodaj novu ulogu
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>Naziv uloge</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>Dozvole</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>Akcije</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>{role.name}</td>
                  <td style={{ padding: '10px 8px', color: '#374151', fontSize: 15 }}>
                    {role.permissions.join(', ')}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    {/* Placeholder for actions like edit/delete */}
                    <button
                      style={{
                        background: '#f1f5f9',
                        border: 'none',
                        borderRadius: 4,
                        padding: '6px 14px',
                        color: '#2563eb',
                        fontWeight: 600,
                        cursor: 'not-allowed',
                        opacity: 0.5,
                      }}
                      disabled
                    >
                      Izmijeni
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 4px 32px rgba(0,0,0,0.14)',
              padding: 28,
              width: '95%',
              maxWidth: 500,
              margin: '0 12px',
              boxSizing: 'border-box',
              position: 'relative',
            }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 18, marginTop: 0 }}>Dodaj novu ulogu</h3>
            <form onSubmit={handleSaveRole}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 7 }}>
                  Naziv uloge
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={handleRoleNameChange}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 5,
                    fontSize: 16,
                  }}
                  placeholder="Unesite naziv uloge"
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 7 }}>
                  Dozvole
                </label>
                <select
                  multiple
                  value={newRolePermissions}
                  onChange={handlePermissionChange}
                  required
                  style={{
                    width: '100%',
                    minHeight: 90,
                    padding: 8,
                    border: '1px solid #d1d5db',
                    borderRadius: 5,
                    fontSize: 16,
                  }}
                >
                  {ALL_PERMISSIONS.map((perm) => (
                    <option key={perm} value={perm}>
                      {perm}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 5,
                    padding: '10px 18px',
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 5,
                    padding: '10px 18px',
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                  disabled={!newRoleName.trim() || newRolePermissions.length === 0}
                >
                  Sačuvaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesSettings;