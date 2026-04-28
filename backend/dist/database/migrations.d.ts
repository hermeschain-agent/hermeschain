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
/** Load every .sql file from `dir` sorted lexicographically. */
export declare function loadMigrationsFromDir(dir: string): MigrationFile[];
export declare function getMigrationsDir(): string;
export interface ApplyOptions {
    /** When true, log the SQL each pending migration would execute and exit
     *  without touching the database. Used by `npm run migrate:status -- --dry-run`. */
    readonly dryRun?: boolean;
}
export declare function applyPendingMigrations(opts?: ApplyOptions): Promise<MigrationResult[]>;
export declare function migrationStatus(): Promise<{
    applied: string[];
    pending: string[];
}>;
//# sourceMappingURL=migrations.d.ts.map