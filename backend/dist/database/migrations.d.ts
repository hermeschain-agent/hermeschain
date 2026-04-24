export interface MigrationFile {
    readonly name: string;
    readonly up: string;
    readonly down: string;
}
export interface MigrationResult {
    readonly name: string;
    readonly success: boolean;
    readonly durationMs: number;
    readonly error?: string;
}
export declare function applyPendingMigrations(): Promise<MigrationResult[]>;
export declare function migrationStatus(): Promise<{
    applied: string[];
    pending: string[];
}>;
//# sourceMappingURL=migrations.d.ts.map