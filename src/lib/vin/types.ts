// The subset of NHTSA vPIC's ~130-field DecodeVinValues response this app
// actually uses. All fields are strings on the wire, empty string ("") when
// NHTSA has no data for that variable — never null/omitted.
export interface NhtsaResult {
  Make: string;
  Model: string;
  ModelYear: string;
  Trim: string;
  Trim2: string;
  EngineCylinders: string;
  DisplacementL: string;
  ErrorCode: string;
  ErrorText: string;
}

export interface VinDecodeResult {
  valid: boolean;
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  engineSummary: string;
  errorCode: string;
  errorText: string;
}
