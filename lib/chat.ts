export function canonicalDmRoom(userA: string, userB: string): string {
    const [a, b] = [userA, userB].sort();
    return `dm:${a}:${b}`;
}