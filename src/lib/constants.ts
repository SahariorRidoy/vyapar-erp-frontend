/** Bangladesh's divisions (the same list as the API's). Stored in the `state` field of companies and parties. */
export const BD_DIVISIONS = ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'];

/** VAT Business Identification Number (stored as `gstin`): 9 digits, optionally with a 4 digit branch suffix. */
export const BIN_RE = /^\d{9}(-?\d{4})?$/;
/** e-TIN (stored as `pan`): 12 digits. */
export const TIN_RE = /^\d{12}$/;

export const BUSINESS_TYPES = ['Retail', 'Wholesale', 'Distributor', 'Manufacturer', 'Services', 'Others'];

export const BUSINESS_CATEGORIES = [
  'Accounting & Audit', 'Agriculture', 'Automobile', 'Electronics', 'Fashion & Apparel', 'FMCG', 'Grocery', 'Hardware',
  'Healthcare & Pharmacy', 'Hotel & Restaurant', 'Jewellery', 'Logistics', 'Real Estate', 'Stationery', 'Textiles', 'Others',
];

/** VAT registration types (stored as `gstType`). */
export const VAT_TYPES = [
  { value: 'unregistered', label: 'Unregistered / Consumer' },
  { value: 'regular', label: 'VAT Registered (BIN)' },
  { value: 'composition', label: 'Turnover Tax Enlisted' },
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Attendance marks the API accepts. Weekly offs are not stored; they come from Settings ▸ HR. */
export const ATTENDANCE_STATUS = {
  present: { label: 'Present', short: 'P', className: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  absent: { label: 'Absent', short: 'A', className: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  half_day: { label: 'Half day', short: 'H', className: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  leave: { label: 'Leave', short: 'L', className: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  holiday: { label: 'Holiday', short: 'HO', className: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
} as const;
export type AttendanceStatus = keyof typeof ATTENDANCE_STATUS;
export const ATTENDANCE_KEYS = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[];
export const WEEK_OFF = { label: 'Weekly off', short: 'W', className: 'bg-slate-100 text-slate-400' };
