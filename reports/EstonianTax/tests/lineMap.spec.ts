import test from 'tape';
import { VAT_CODES } from '../../../regional/ee';
import {
  emptyKmdBody,
  jeNet,
  pickVersion,
  VAT_CODE_TO_BUCKET,
} from '../lineMap';

// EE: off-KMD codes map to null — OSS files separately, PE supply taxed abroad
const OFF_KMD = new Set(['OSS_SALES', 'EU_FIXED_ESTAB']);

test('lineMap: every VAT code has an entry (bucket or explicit null)', (t) => {
  for (const code of Object.keys(VAT_CODES)) {
    t.ok(code in VAT_CODE_TO_BUCKET, `${code} present in VAT_CODE_TO_BUCKET`);
    const bucket = VAT_CODE_TO_BUCKET[code as keyof typeof VAT_CODE_TO_BUCKET];
    if (OFF_KMD.has(code)) {
      t.equal(bucket, null, `${code} is off-KMD (null)`);
    } else {
      t.ok(bucket, `${code} has bucket`);
    }
  }
  t.end();
});

test('lineMap: margin scheme codes feed the matching rate line', (t) => {
  t.equal(VAT_CODE_TO_BUCKET.MARGIN_24!.primary, 'transactions24');
  t.equal(VAT_CODE_TO_BUCKET.MARGIN_22!.primary, 'transactions22');
  t.equal(VAT_CODE_TO_BUCKET.MARGIN_9!.primary, 'transactions9');
  t.equal(VAT_CODE_TO_BUCKET.MARGIN_5!.primary, 'transactions5');
  t.equal(VAT_CODE_TO_BUCKET.MARGIN_24!.side, 'sales');
  t.end();
});

test('lineMap: ZERO_EU_B2B (goods) feeds line 3 + 3.1 + 3.1.1, VD goods', (t) => {
  const b = VAT_CODE_TO_BUCKET.ZERO_EU_B2B!;
  t.equal(b.primary, 'transactionsZeroVat');
  t.deepEqual(b.also, [
    'euSupplyInclGoodsAndServicesZeroVat',
    'euSupplyGoodsZeroVat',
  ]);
  t.equal(b.vdColumn, 'goods');
  t.end();
});

test('lineMap: ZERO_EU_GOODS feeds 3.1 + 3.1.1, VD goods', (t) => {
  const b = VAT_CODE_TO_BUCKET.ZERO_EU_GOODS!;
  t.deepEqual(b.also, [
    'euSupplyInclGoodsAndServicesZeroVat',
    'euSupplyGoodsZeroVat',
  ]);
  t.equal(b.vdColumn, 'goods');
  t.end();
});

test('lineMap: ZERO_EU_SERVICES feeds 3.1 only (not 3.1.1), VD services', (t) => {
  const b = VAT_CODE_TO_BUCKET.ZERO_EU_SERVICES!;
  t.deepEqual(b.also, ['euSupplyInclGoodsAndServicesZeroVat']);
  t.notOk(
    b.also?.includes('euSupplyGoodsZeroVat'),
    'services excluded from 3.1.1'
  );
  t.equal(b.vdColumn, 'services');
  t.end();
});

test('lineMap: ZERO_EU_TRIANGLE feeds VD triangle only, no KMD line', (t) => {
  const b = VAT_CODE_TO_BUCKET.ZERO_EU_TRIANGLE!;
  t.notOk(b.primary, 'no KMD primary line');
  t.notOk(b.also, 'no KMD also lines');
  t.equal(b.vdColumn, 'triangle');
  t.end();
});

test('lineMap: ZERO_EXPORT feeds line 3 + 3.2', (t) => {
  const b = VAT_CODE_TO_BUCKET.ZERO_EXPORT!;
  t.equal(b.primary, 'transactionsZeroVat');
  t.deepEqual(b.also, ['exportZeroVat']);
  t.end();
});

test('lineMap: EU_RC_GOODS feeds line 6 + 6.1 + 1', (t) => {
  const b = VAT_CODE_TO_BUCKET.EU_RC_GOODS!;
  t.equal(b.primary, 'euAcquisitionsGoodsAndServicesTotal');
  t.deepEqual(b.also, ['euAcquisitionsGoods', 'transactions24']);
  t.equal(b.side, 'rc-purchase');
  t.equal(b.rate, 24);
  t.end();
});

test('lineMap: NON_EU_RC feeds line 7 + 1', (t) => {
  const b = VAT_CODE_TO_BUCKET.NON_EU_RC!;
  t.equal(b.primary, 'acquisitionOtherGoodsAndServicesTotal');
  t.deepEqual(b.also, ['transactions24']);
  t.end();
});

test('pickVersion: KMD6 from 07.2025+', (t) => {
  t.equal(pickVersion(2025, 7), 'KMD6');
  t.equal(pickVersion(2026, 5), 'KMD6');
  t.equal(pickVersion(2025, 6), 'KMD5');
  t.equal(pickVersion(2025, 1), 'KMD5');
  t.equal(pickVersion(2024, 12), 'KMD4');
  t.equal(pickVersion(2024, 1), 'KMD4');
  t.end();
});

test('emptyKmdBody: all fields start at 0', (t) => {
  const b = emptyKmdBody();
  for (const k of Object.keys(b)) {
    t.equal(b[k as keyof typeof b], 0, `${k} starts at 0`);
  }
  t.end();
});

test('jeNet: sales-side code counts income rows only; purchases count the rest', (t) => {
  const liquid = new Set(['Bank']);
  const income = new Set(['3025 - Service Exports']);
  const fee = [
    { account: '4340 - Banking Services', debit: '0.22' },
    { account: 'Bank', credit: '0.22' },
  ];
  const payout = [
    { account: 'Bank', debit: '100' },
    { account: '3025 - Service Exports', credit: '100' },
  ];
  const refund = [
    { account: '3025 - Service Exports', debit: '30' },
    { account: 'Bank', credit: '30' },
  ];
  const saas = [
    { account: '4320 - IT Services', debit: '90' },
    { account: 'Bank', credit: '90' },
  ];

  t.equal(jeNet(fee, 'sales', liquid, income), 0, 'EXEMPT bank fee off line 8');
  t.equal(jeNet(payout, 'sales', liquid, income), 100);
  t.equal(jeNet(refund, 'sales', liquid, income), -30, 'refund reduces supply');
  t.equal(jeNet(saas, 'rc-purchase', liquid, income), 90);
  t.end();
});
