import type { Language } from '@/state/settings';

export type DtcSystem = 'powertrain' | 'chassis' | 'body' | 'network';
export type Severity = 'high' | 'medium' | 'low';

interface Entry {
  tr: string;
  en: string;
  sev?: Severity;
}

/**
 * Generic (SAE J2012) code descriptions — the most frequently seen codes.
 * Unknown codes fall back to a subsystem description derived from the code structure.
 */
const CODES: Record<string, Entry> = {
  P0010: { tr: 'Eksantrik mili konum aktüatörü devresi (Banka 1)', en: 'Camshaft position actuator circuit (Bank 1)', sev: 'medium' },
  P0011: { tr: 'Eksantrik zamanlaması fazla avans (Banka 1)', en: 'Camshaft timing over-advanced (Bank 1)', sev: 'medium' },
  P0016: { tr: 'Krank–eksantrik konum korelasyonu (Banka 1 Sensör A)', en: 'Crankshaft/camshaft position correlation (Bank 1 Sensor A)', sev: 'high' },
  P0068: { tr: 'MAP/MAF – gaz kelebeği konumu korelasyonu', en: 'MAP/MAF – throttle position correlation', sev: 'medium' },
  P0087: { tr: 'Yakıt rayı/sistem basıncı çok düşük', en: 'Fuel rail/system pressure too low', sev: 'high' },
  P0088: { tr: 'Yakıt rayı/sistem basıncı çok yüksek', en: 'Fuel rail/system pressure too high', sev: 'high' },
  P0100: { tr: 'Hava akış (MAF) sensörü devresi arızası', en: 'Mass air flow circuit malfunction', sev: 'medium' },
  P0101: { tr: 'Hava akış (MAF) sensörü aralık/performans sorunu', en: 'Mass air flow circuit range/performance', sev: 'medium' },
  P0102: { tr: 'Hava akış (MAF) sensörü devresi düşük giriş', en: 'Mass air flow circuit low input', sev: 'medium' },
  P0103: { tr: 'Hava akış (MAF) sensörü devresi yüksek giriş', en: 'Mass air flow circuit high input', sev: 'medium' },
  P0106: { tr: 'Manifold basınç (MAP) sensörü aralık/performans', en: 'MAP/barometric pressure circuit range/performance', sev: 'medium' },
  P0107: { tr: 'Manifold basınç (MAP) sensörü düşük giriş', en: 'MAP/barometric pressure circuit low input', sev: 'medium' },
  P0108: { tr: 'Manifold basınç (MAP) sensörü yüksek giriş', en: 'MAP/barometric pressure circuit high input', sev: 'medium' },
  P0110: { tr: 'Emme havası sıcaklık sensörü devresi', en: 'Intake air temperature circuit malfunction', sev: 'low' },
  P0113: { tr: 'Emme havası sıcaklık sensörü yüksek giriş', en: 'Intake air temperature circuit high input', sev: 'low' },
  P0115: { tr: 'Motor soğutma suyu sıcaklık sensörü devresi', en: 'Engine coolant temperature circuit malfunction', sev: 'medium' },
  P0117: { tr: 'Soğutma suyu sıcaklık sensörü düşük giriş', en: 'Engine coolant temperature circuit low input', sev: 'medium' },
  P0118: { tr: 'Soğutma suyu sıcaklık sensörü yüksek giriş', en: 'Engine coolant temperature circuit high input', sev: 'medium' },
  P0120: { tr: 'Gaz kelebeği konum sensörü A devresi', en: 'Throttle position sensor A circuit malfunction', sev: 'medium' },
  P0121: { tr: 'Gaz kelebeği konum sensörü A aralık/performans', en: 'Throttle position sensor A range/performance', sev: 'medium' },
  P0128: { tr: 'Termostat: soğutma suyu sıcaklığı termostat değerinin altında', en: 'Coolant thermostat (temperature below regulating temperature)', sev: 'low' },
  P0130: { tr: 'O2 sensörü devresi (Banka 1 Sensör 1)', en: 'O2 sensor circuit malfunction (Bank 1 Sensor 1)', sev: 'medium' },
  P0131: { tr: 'O2 sensörü düşük voltaj (Banka 1 Sensör 1)', en: 'O2 sensor circuit low voltage (Bank 1 Sensor 1)', sev: 'medium' },
  P0133: { tr: 'O2 sensörü yavaş tepki (Banka 1 Sensör 1)', en: 'O2 sensor circuit slow response (Bank 1 Sensor 1)', sev: 'medium' },
  P0134: { tr: 'O2 sensörü aktivite yok (Banka 1 Sensör 1)', en: 'O2 sensor no activity detected (Bank 1 Sensor 1)', sev: 'medium' },
  P0135: { tr: 'O2 sensörü ısıtıcı devresi (Banka 1 Sensör 1)', en: 'O2 sensor heater circuit (Bank 1 Sensor 1)', sev: 'medium' },
  P0136: { tr: 'O2 sensörü devresi (Banka 1 Sensör 2)', en: 'O2 sensor circuit malfunction (Bank 1 Sensor 2)', sev: 'low' },
  P0141: { tr: 'O2 sensörü ısıtıcı devresi (Banka 1 Sensör 2)', en: 'O2 sensor heater circuit (Bank 1 Sensor 2)', sev: 'low' },
  P0171: { tr: 'Sistem çok fakir (Banka 1)', en: 'System too lean (Bank 1)', sev: 'medium' },
  P0172: { tr: 'Sistem çok zengin (Banka 1)', en: 'System too rich (Bank 1)', sev: 'medium' },
  P0174: { tr: 'Sistem çok fakir (Banka 2)', en: 'System too lean (Bank 2)', sev: 'medium' },
  P0175: { tr: 'Sistem çok zengin (Banka 2)', en: 'System too rich (Bank 2)', sev: 'medium' },
  P0191: { tr: 'Yakıt rayı basınç sensörü aralık/performans', en: 'Fuel rail pressure sensor range/performance', sev: 'high' },
  P0201: { tr: 'Enjektör devresi – Silindir 1', en: 'Injector circuit malfunction – Cylinder 1', sev: 'high' },
  P0217: { tr: 'Motor aşırı ısınma durumu', en: 'Engine over-temperature condition', sev: 'high' },
  P0234: { tr: 'Turbo/süperşarj aşırı basınç (overboost)', en: 'Turbo/supercharger overboost condition', sev: 'high' },
  P0299: { tr: 'Turbo/süperşarj düşük basınç (underboost)', en: 'Turbo/supercharger underboost', sev: 'medium' },
  P0300: { tr: 'Rastgele/çoklu silindir tekleme tespit edildi', en: 'Random/multiple cylinder misfire detected', sev: 'high' },
  P0301: { tr: '1. silindirde tekleme tespit edildi', en: 'Cylinder 1 misfire detected', sev: 'high' },
  P0302: { tr: '2. silindirde tekleme tespit edildi', en: 'Cylinder 2 misfire detected', sev: 'high' },
  P0303: { tr: '3. silindirde tekleme tespit edildi', en: 'Cylinder 3 misfire detected', sev: 'high' },
  P0304: { tr: '4. silindirde tekleme tespit edildi', en: 'Cylinder 4 misfire detected', sev: 'high' },
  P0305: { tr: '5. silindirde tekleme tespit edildi', en: 'Cylinder 5 misfire detected', sev: 'high' },
  P0306: { tr: '6. silindirde tekleme tespit edildi', en: 'Cylinder 6 misfire detected', sev: 'high' },
  P0325: { tr: 'Vuruntu sensörü 1 devresi (Banka 1)', en: 'Knock sensor 1 circuit (Bank 1)', sev: 'medium' },
  P0335: { tr: 'Krank mili konum sensörü A devresi', en: 'Crankshaft position sensor A circuit', sev: 'high' },
  P0340: { tr: 'Eksantrik mili konum sensörü A devresi (Banka 1)', en: 'Camshaft position sensor A circuit (Bank 1)', sev: 'high' },
  P0351: { tr: 'Ateşleme bobini A birincil/ikincil devresi', en: 'Ignition coil A primary/secondary circuit', sev: 'high' },
  P0380: { tr: 'Kızdırma bujisi/ısıtıcı devresi A', en: 'Glow plug/heater circuit A', sev: 'medium' },
  P0400: { tr: 'EGR akış arızası', en: 'Exhaust gas recirculation flow malfunction', sev: 'medium' },
  P0401: { tr: 'EGR akışı yetersiz', en: 'Exhaust gas recirculation flow insufficient', sev: 'medium' },
  P0402: { tr: 'EGR akışı aşırı', en: 'Exhaust gas recirculation flow excessive', sev: 'medium' },
  P0403: { tr: 'EGR kontrol devresi', en: 'Exhaust gas recirculation control circuit', sev: 'medium' },
  P0420: { tr: 'Katalizör verimi eşik değerin altında (Banka 1)', en: 'Catalyst system efficiency below threshold (Bank 1)', sev: 'medium' },
  P0430: { tr: 'Katalizör verimi eşik değerin altında (Banka 2)', en: 'Catalyst system efficiency below threshold (Bank 2)', sev: 'medium' },
  P0440: { tr: 'Buharlaşma emisyon (EVAP) sistemi arızası', en: 'Evaporative emission control system malfunction', sev: 'low' },
  P0441: { tr: 'EVAP sistemi hatalı tahliye akışı', en: 'Evaporative emission system incorrect purge flow', sev: 'low' },
  P0442: { tr: 'EVAP sisteminde küçük kaçak', en: 'Evaporative emission system leak detected (small leak)', sev: 'low' },
  P0446: { tr: 'EVAP havalandırma kontrol devresi', en: 'Evaporative emission system vent control circuit', sev: 'low' },
  P0455: { tr: 'EVAP sisteminde büyük kaçak (yakıt kapağını kontrol edin)', en: 'Evaporative emission system leak detected (large leak)', sev: 'low' },
  P0456: { tr: 'EVAP sisteminde çok küçük kaçak', en: 'Evaporative emission system leak detected (very small leak)', sev: 'low' },
  P0480: { tr: 'Soğutma fanı 1 kontrol devresi', en: 'Cooling fan 1 control circuit', sev: 'medium' },
  P0500: { tr: 'Araç hız sensörü A', en: 'Vehicle speed sensor A malfunction', sev: 'medium' },
  P0505: { tr: 'Rölanti hava kontrol sistemi', en: 'Idle air control system malfunction', sev: 'medium' },
  P0506: { tr: 'Rölanti devri beklenenden düşük', en: 'Idle control system RPM lower than expected', sev: 'low' },
  P0507: { tr: 'Rölanti devri beklenenden yüksek', en: 'Idle control system RPM higher than expected', sev: 'low' },
  P0562: { tr: 'Sistem voltajı düşük', en: 'System voltage low', sev: 'medium' },
  P0563: { tr: 'Sistem voltajı yüksek', en: 'System voltage high', sev: 'medium' },
  P0571: { tr: 'Fren anahtarı A devresi', en: 'Brake switch A circuit', sev: 'low' },
  P0600: { tr: 'Seri iletişim bağlantısı', en: 'Serial communication link malfunction', sev: 'medium' },
  P0601: { tr: 'Motor kontrol modülü hafıza sağlama hatası', en: 'Internal control module memory checksum error', sev: 'high' },
  P0606: { tr: 'Kontrol modülü işlemci arızası', en: 'Control module processor fault', sev: 'high' },
  P0700: { tr: 'Şanzıman kontrol sistemi (TCM) arıza talebi', en: 'Transmission control system malfunction (MIL request)', sev: 'medium' },
  P0705: { tr: 'Vites konum sensörü devresi (PRNDL)', en: 'Transmission range sensor circuit (PRNDL input)', sev: 'medium' },
  P0715: { tr: 'Giriş/türbin hız sensörü A devresi', en: 'Input/turbine speed sensor A circuit', sev: 'medium' },
  P0730: { tr: 'Hatalı vites oranı', en: 'Incorrect gear ratio', sev: 'medium' },
  P0741: { tr: 'Tork konvertörü kavrama devresi performans/kapalı kalma', en: 'Torque converter clutch circuit performance or stuck off', sev: 'medium' },
  P2002: { tr: 'Dizel partikül filtresi verimi eşik altında (Banka 1)', en: 'Diesel particulate filter efficiency below threshold (Bank 1)', sev: 'medium' },
  P2135: { tr: 'Gaz kelebeği/pedal konum sensörü A/B voltaj korelasyonu', en: 'Throttle/pedal position sensor A/B voltage correlation', sev: 'high' },
  P2187: { tr: 'Rölantide sistem çok fakir (Banka 1)', en: 'System too lean at idle (Bank 1)', sev: 'medium' },
  P2195: { tr: 'O2 sensörü sinyali fakirde takılı (Banka 1 Sensör 1)', en: 'O2 sensor signal stuck lean (Bank 1 Sensor 1)', sev: 'medium' },
  P2463: { tr: 'Dizel partikül filtresi – kurum birikimi', en: 'Diesel particulate filter – soot accumulation', sev: 'medium' },
  U0001: { tr: 'Yüksek hızlı CAN iletişim veri yolu', en: 'High speed CAN communication bus', sev: 'high' },
  U0100: { tr: 'Motor kontrol modülü (ECM/PCM) ile iletişim kaybı', en: 'Lost communication with ECM/PCM A', sev: 'high' },
  U0101: { tr: 'Şanzıman kontrol modülü (TCM) ile iletişim kaybı', en: 'Lost communication with TCM', sev: 'high' },
  U0121: { tr: 'ABS kontrol modülü ile iletişim kaybı', en: 'Lost communication with anti-lock brake system (ABS) control module', sev: 'high' },
  U0140: { tr: 'Gövde kontrol modülü (BCM) ile iletişim kaybı', en: 'Lost communication with body control module', sev: 'medium' },
  U0155: { tr: 'Gösterge paneli modülü ile iletişim kaybı', en: 'Lost communication with instrument panel cluster', sev: 'medium' },
  C0035: { tr: 'Sol ön tekerlek hız sensörü devresi', en: 'Left front wheel speed sensor circuit', sev: 'medium' },
  C0040: { tr: 'Sağ ön tekerlek hız sensörü devresi', en: 'Right front wheel speed sensor circuit', sev: 'medium' },
  B0001: { tr: 'Sürücü ön hava yastığı ateşleme kontrolü', en: 'Driver frontal stage 1 deployment control', sev: 'high' },
};

const SYSTEM_BY_LETTER: Record<string, DtcSystem> = { P: 'powertrain', C: 'chassis', B: 'body', U: 'network' };

export function dtcSystem(code: string): DtcSystem {
  return SYSTEM_BY_LETTER[code[0] ?? 'P'] ?? 'powertrain';
}

/** SAE-defined (generic) codes vs manufacturer-specific ones. */
export function isGeneric(code: string): boolean {
  const d1 = code[1];
  if (code[0] === 'P') return d1 === '0' || d1 === '2' || (d1 === '3' && /^[4-9]/.test(code[2] ?? ''));
  return d1 === '0' || d1 === '3';
}

const P_SUBSYSTEM: Record<string, Entry> = {
  '0': { tr: 'Yakıt/hava ölçümü ve yardımcı emisyon', en: 'Fuel and air metering, auxiliary emission controls' },
  '1': { tr: 'Yakıt ve hava ölçümü', en: 'Fuel and air metering' },
  '2': { tr: 'Yakıt ve hava ölçümü (enjektör devresi)', en: 'Fuel and air metering (injector circuit)' },
  '3': { tr: 'Ateşleme sistemi veya tekleme', en: 'Ignition system or misfire' },
  '4': { tr: 'Yardımcı emisyon kontrolleri', en: 'Auxiliary emission controls' },
  '5': { tr: 'Araç hızı, rölanti kontrolü ve yardımcı girişler', en: 'Vehicle speed, idle control and auxiliary inputs' },
  '6': { tr: 'Bilgisayar ve yardımcı çıkışlar', en: 'Computer and auxiliary outputs' },
  '7': { tr: 'Şanzıman', en: 'Transmission' },
  '8': { tr: 'Şanzıman', en: 'Transmission' },
  '9': { tr: 'Şanzıman', en: 'Transmission' },
  A: { tr: 'Hibrit güç aktarma', en: 'Hybrid propulsion' },
  B: { tr: 'Hibrit güç aktarma', en: 'Hybrid propulsion' },
  C: { tr: 'Hibrit güç aktarma', en: 'Hybrid propulsion' },
};

export interface DtcDescription {
  title: string;
  known: boolean;
  system: DtcSystem;
  generic: boolean;
  severity?: Severity;
  subsystem?: string;
}

export function describeDtc(code: string, lang: Language): DtcDescription {
  const entry = CODES[code];
  const system = dtcSystem(code);
  const generic = isGeneric(code);
  const sub = system === 'powertrain' ? P_SUBSYSTEM[code[2] ?? ''] : undefined;
  if (entry) return { title: entry[lang], known: true, system, generic, severity: entry.sev, subsystem: sub?.[lang] };
  return { title: sub?.[lang] ?? '', known: false, system, generic, subsystem: sub?.[lang] };
}
