interface UserToken {
    instanceUrl: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    snUser: string;
    snUserSysId: string;
}
export declare function authLogin(): Promise<void>;
export declare function authLogout(instanceUrl?: string): void;
export declare function authWhoami(): void;
export declare function getStoredToken(instanceUrl: string): UserToken | undefined;
export {};
//# sourceMappingURL=auth.d.ts.map