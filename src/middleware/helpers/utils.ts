export function capitalizedMessage(message: any): string {
  const strMessage = typeof message === 'string' ? message : String(message);
  return strMessage.charAt(0).toUpperCase() + strMessage.slice(1);
}
