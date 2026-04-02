export const config = {
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_ID' : '');
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET || (process.env.NODE_ENV === 'test' ? 'MOCK_CLIENT_SECRET' : '');
  },
  get googleRedirectUri() {
    return process.env.GOOGLE_REDIRECT_URI || (process.env.NODE_ENV === 'test' ? 'MOCK_REDIRECT_URI' : '');
  },
  get jwtSecret() {
    return process.env.JWT_SECRET || 'default_secret';
  }
};
