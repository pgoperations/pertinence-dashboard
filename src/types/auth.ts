export type UserRole = 'admin' | 'editor' | 'viewer';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
};

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';
