export function normalizeForMatch(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function fuzzyMatch(a: string, b: string, maxDistance = 2): boolean {
	const na = normalizeForMatch(a);
	const nb = normalizeForMatch(b);
	if (na === nb) return true;
	return levenshtein(na, nb) <= maxDistance;
}

function levenshtein(a: string, b: string): number {
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);

	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	return matrix[a.length][b.length];
}
