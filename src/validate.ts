import { Value } from "@sinclair/typebox/value";
import { PulseMapSchema } from "../schema/map";
import type { PulseMap } from "../schema/map";

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ValidationError {
	path: string;
	message: string;
}

export function validate(data: unknown): ValidationResult {
	const errors: ValidationError[] = [];

	if (!Value.Check(PulseMapSchema, data)) {
		for (const error of Value.Errors(PulseMapSchema, data)) {
			errors.push({
				path: error.path,
				message: error.message,
			});
		}
	}

	return { valid: errors.length === 0, errors };
}

export function assertValid(data: unknown): asserts data is PulseMap {
	const result = validate(data);
	if (!result.valid) {
		const messages = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
		throw new Error(`Invalid PulseMap:\n${messages}`);
	}
}
