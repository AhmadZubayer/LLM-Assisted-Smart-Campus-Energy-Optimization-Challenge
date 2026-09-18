export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly logDetail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
