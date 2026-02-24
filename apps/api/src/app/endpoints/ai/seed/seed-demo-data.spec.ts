/**
 * Unit tests for the demo seed data definitions.
 *
 * Validates seed data consistency without touching the database.
 */
import {
  DEMO_ACCOUNTS,
  DEMO_ACTIVITIES,
  DEMO_SYMBOL_PROFILES,
  DEMO_USER_ID,
  buildActivityCreateInput,
  computeSeedStats
} from './seed-demo-data';

describe('seed-demo data definitions', () => {
  describe('DEMO_USER_ID', () => {
    it('is a valid UUID v4', () => {
      expect(DEMO_USER_ID).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('DEMO_ACCOUNTS', () => {
    it('has at least 2 accounts (taxable + retirement)', () => {
      expect(DEMO_ACCOUNTS.length).toBeGreaterThanOrEqual(2);
    });

    it('every account has an id, name, and currency', () => {
      for (const account of DEMO_ACCOUNTS) {
        expect(account.id).toBeTruthy();
        expect(account.name).toBeTruthy();
        expect(account.currency).toBeTruthy();
      }
    });

    it('account ids are unique', () => {
      const ids = DEMO_ACCOUNTS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('DEMO_SYMBOL_PROFILES', () => {
    it('has at least 8 symbol profiles for diverse testing', () => {
      expect(DEMO_SYMBOL_PROFILES.length).toBeGreaterThanOrEqual(8);
    });

    it('every profile has symbol, dataSource, currency, assetClass, assetSubClass, and name', () => {
      for (const profile of DEMO_SYMBOL_PROFILES) {
        expect(profile.symbol).toBeTruthy();
        expect(profile.dataSource).toBeTruthy();
        expect(profile.currency).toBeTruthy();
        expect(profile.assetClass).toBeTruthy();
        expect(profile.assetSubClass).toBeTruthy();
        expect(profile.name).toBeTruthy();
      }
    });

    it('symbol+dataSource pairs are unique', () => {
      const keys = DEMO_SYMBOL_PROFILES.map(
        (p) => `${p.dataSource}:${p.symbol}`
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('includes at least one profile with sectors metadata', () => {
      const withSectors = DEMO_SYMBOL_PROFILES.filter(
        (p) => p.sectors && (p.sectors as unknown[]).length > 0
      );
      expect(withSectors.length).toBeGreaterThanOrEqual(1);
    });

    it('includes at least one profile with countries metadata', () => {
      const withCountries = DEMO_SYMBOL_PROFILES.filter(
        (p) => p.countries && (p.countries as unknown[]).length > 0
      );
      expect(withCountries.length).toBeGreaterThanOrEqual(1);
    });

    it('covers multiple asset classes', () => {
      const assetClasses = new Set(
        DEMO_SYMBOL_PROFILES.map((p) => p.assetClass)
      );
      expect(assetClasses.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe('DEMO_ACTIVITIES', () => {
    it('has at least 30 activities for rich tool testing', () => {
      expect(DEMO_ACTIVITIES.length).toBeGreaterThanOrEqual(30);
    });

    it('every activity references a known symbol profile', () => {
      const knownSymbols = new Set(
        DEMO_SYMBOL_PROFILES.map((p) => `${p.dataSource}:${p.symbol}`)
      );

      for (const activity of DEMO_ACTIVITIES) {
        expect(
          knownSymbols.has(`${activity.dataSource}:${activity.symbol}`)
        ).toBe(true);
      }
    });

    it('every activity references a known account id', () => {
      const knownAccountIds = new Set(DEMO_ACCOUNTS.map((a) => a.id));

      for (const activity of DEMO_ACTIVITIES) {
        expect(knownAccountIds.has(activity.accountId)).toBe(true);
      }
    });

    it('includes BUY, SELL, and DIVIDEND transaction types', () => {
      const types = new Set(DEMO_ACTIVITIES.map((a) => a.type));
      expect(types.has('BUY')).toBe(true);
      expect(types.has('SELL')).toBe(true);
      expect(types.has('DIVIDEND')).toBe(true);
    });

    it('has sells that follow buys of the same symbol (for FIFO tax calc)', () => {
      const buySymbols = new Set(
        DEMO_ACTIVITIES.filter((a) => a.type === 'BUY').map((a) => a.symbol)
      );
      const sellSymbols = DEMO_ACTIVITIES.filter((a) => a.type === 'SELL').map(
        (a) => a.symbol
      );

      for (const symbol of sellSymbols) {
        expect(buySymbols.has(symbol)).toBe(true);
      }
    });

    it('sell quantities do not exceed cumulative buy quantities per symbol', () => {
      const sortedActivities = [...DEMO_ACTIVITIES].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const holdings: Record<string, number> = {};

      for (const activity of sortedActivities) {
        if (activity.type === 'BUY') {
          holdings[activity.symbol] =
            (holdings[activity.symbol] ?? 0) + activity.quantity;
        } else if (activity.type === 'SELL') {
          holdings[activity.symbol] =
            (holdings[activity.symbol] ?? 0) - activity.quantity;
          expect(holdings[activity.symbol]).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('spans at least 2 calendar years for tax_estimate testing', () => {
      const years = new Set(
        DEMO_ACTIVITIES.map((a) => new Date(a.date).getFullYear())
      );
      expect(years.size).toBeGreaterThanOrEqual(2);
    });

    it('every activity has valid fee >= 0', () => {
      for (const activity of DEMO_ACTIVITIES) {
        expect(activity.fee).toBeGreaterThanOrEqual(0);
      }
    });

    it('every activity has quantity > 0 and unitPrice > 0', () => {
      for (const activity of DEMO_ACTIVITIES) {
        expect(activity.quantity).toBeGreaterThan(0);
        expect(activity.unitPrice).toBeGreaterThan(0);
      }
    });
  });

  describe('buildActivityCreateInput', () => {
    it('maps an activity to Prisma Order create input', () => {
      const activity = DEMO_ACTIVITIES[0];
      const profileIdMap = new Map<string, string>();
      profileIdMap.set(
        `${activity.dataSource}:${activity.symbol}`,
        'profile-id-123'
      );

      const result = buildActivityCreateInput(activity, profileIdMap);

      expect(result).toMatchObject({
        date: expect.any(Date),
        fee: activity.fee,
        quantity: activity.quantity,
        type: activity.type,
        unitPrice: activity.unitPrice
      });
      expect(result.SymbolProfile.connect.id).toBe('profile-id-123');
      expect(result.account.connect.id_userId.id).toBe(activity.accountId);
      expect(result.user.connect.id).toBe(DEMO_USER_ID);
    });

    it('throws when profile ID is not in the map', () => {
      const activity = DEMO_ACTIVITIES[0];
      const emptyMap = new Map<string, string>();

      expect(() => buildActivityCreateInput(activity, emptyMap)).toThrow(
        /No SymbolProfile ID found/
      );
    });
  });

  describe('computeSeedStats', () => {
    it('returns correct summary counts', () => {
      const stats = computeSeedStats();

      expect(stats.totalActivities).toBe(DEMO_ACTIVITIES.length);
      expect(stats.uniqueSymbols).toBe(
        new Set(DEMO_ACTIVITIES.map((a) => a.symbol)).size
      );
      expect(stats.accountCount).toBe(DEMO_ACCOUNTS.length);
      expect(stats.buyCount).toBeGreaterThan(0);
      expect(stats.sellCount).toBeGreaterThan(0);
      expect(stats.dividendCount).toBeGreaterThan(0);
      expect(
        stats.buyCount + stats.sellCount + stats.dividendCount
      ).toBeLessThanOrEqual(stats.totalActivities);
    });
  });
});
