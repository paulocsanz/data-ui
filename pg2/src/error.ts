export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NoPrimaryKeyError extends AppError {
  constructor() {
    super('No primary key found for table', 400);
    this.name = 'NoPrimaryKeyError';
  }
}
