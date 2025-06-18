export function authorize(req: Request): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const token = process.env.TOKEN;
  const authorization = req.headers.get('authorization');

  if (!authorization) {
    return false;
  }

  if (!token) {
    return false;
  }

  const expectedAuth = `Bearer ${token}`;
  return authorization === expectedAuth && authorization.length > 0;
}
