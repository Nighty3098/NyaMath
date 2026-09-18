import type { LText } from '../i18n';

export interface ConstSection {
  id: string;
  label: LText;
}

export interface ConstSource {
  title: string;
  url: string;
}

export interface ConstEntry {
  id: string;
  section: string;
  label: LText;
  hint: LText;
  /** Имя константы в scope движка — вставка одним блоком покажет её значение. */
  code: string;
  sources: ConstSource[];
}

export const CONST_SECTIONS: ConstSection[] = [
  { id: 'fundamental', label: { ru: 'Фундаментальные · точные (SI-2019)', en: 'Fundamental · exact (SI-2019)' } },
  { id: 'measured', label: { ru: 'Измеряемые · CODATA 2022', en: 'Measured · CODATA 2022' } },
  { id: 'standards', label: { ru: 'Стандарты и астрономия', en: 'Standards & astronomy' } },
];

const N2 = (title: string, url: string): { title: string; url: string } => ({ title, url });
const NIST = N2('CODATA 2022 — NIST', 'https://physics.nist.gov/cuu/Constants/index.html');

export const CONSTANTS: ConstEntry[] = [
  // ================= ФУНДАМЕНТАЛЬНЫЕ · ТОЧНЫЕ (SI-2019) =================
  {
    id: 'c-speed', section: 'fundamental',
    label: { ru: 'Скорость света c', en: 'Speed of light c' },
    hint: { ru: 'c = 299 792 458 м/с · точно', en: 'c = 299 792 458 m/s · exact' },
    code: 'c_light',
    sources: [NIST],
  },
  {
    id: 'h-planck', section: 'fundamental',
    label: { ru: 'Постоянная Планка h', en: 'Planck constant h' },
    hint: { ru: 'h = 6.62607015·10⁻³⁴ Дж·с · точно', en: 'h = 6.62607015×10⁻³⁴ J·s · exact' },
    code: 'h_planck',
    sources: [NIST],
  },
  {
    id: 'hbar-reduced', section: 'fundamental',
    label: { ru: 'Приведённая постоянная Планка ℏ', en: 'Reduced Planck constant ℏ' },
    hint: { ru: 'ℏ = h/2π ≈ 1.0545718·10⁻³⁴ Дж·с', en: 'ℏ = h/2π ≈ 1.0545718×10⁻³⁴ J·s' },
    code: 'hbar',
    sources: [NIST],
  },
  {
    id: 'k-boltzmann', section: 'fundamental',
    label: { ru: 'Постоянная Больцмана k', en: 'Boltzmann constant k' },
    hint: { ru: 'k = 1.380649·10⁻²³ Дж/К · точно', en: 'k = 1.380649×10⁻²³ J/K · exact' },
    code: 'k_B',
    sources: [NIST],
  },
  {
    id: 'e-charge', section: 'fundamental',
    label: { ru: 'Элементарный заряд e', en: 'Elementary charge e' },
    hint: { ru: 'e = 1.602176634·10⁻¹⁹ Кл · точно', en: 'e = 1.602176634×10⁻¹⁹ C · exact' },
    code: 'q_e',
    sources: [NIST],
  },
  {
    id: 'na-avogadro', section: 'fundamental',
    label: { ru: 'Постоянная Авогадро N_A', en: 'Avogadro constant N_A' },
    hint: { ru: 'N_A = 6.02214076·10²³ моль⁻¹ · точно', en: 'N_A = 6.02214076×10²³ mol⁻¹ · exact' },
    code: 'N_A',
    sources: [NIST],
  },
  {
    id: 'r-gas', section: 'fundamental',
    label: { ru: 'Молярная газовая постоянная R', en: 'Molar gas constant R' },
    hint: { ru: 'R = N_A·k = 8.3144626 Дж/(моль·К) · точно', en: 'R = N_A·k = 8.3144626 J/(mol·K) · exact' },
    code: 'R_gas',
    sources: [NIST],
  },
  {
    id: 'f-faraday', section: 'fundamental',
    label: { ru: 'Постоянная Фарадея F', en: 'Faraday constant F' },
    hint: { ru: 'F = N_A·e = 96 485.332 Кл/моль · точно', en: 'F = N_A·e = 96 485.332 C/mol · exact' },
    code: 'F_const',
    sources: [NIST],
  },
  {
    id: 'sigma-stefan', section: 'fundamental',
    label: { ru: 'Постоянная Стефана–Больцмана σ', en: 'Stefan–Boltzmann constant σ' },
    hint: { ru: 'σ = 5.670374419·10⁻⁸ Вт/(м²·К⁴) · точно', en: 'σ = 5.670374419×10⁻⁸ W/(m²·K⁴) · exact' },
    code: 'sigma_sb',
    sources: [NIST],
  },
  // ================= ИЗМЕРЯЕМЫЕ · CODATA 2022 =================
  {
    id: 'mu0-vacuum', section: 'measured',
    label: { ru: 'Магнитная постоянная μ₀', en: 'Vacuum permeability μ₀' },
    hint: { ru: 'μ₀ = 1.25663706127(20)·10⁻⁶ Н/А²', en: 'μ₀ = 1.25663706127(20)×10⁻⁶ N/A²' },
    code: 'mu_0',
    sources: [NIST],
  },
  {
    id: 'eps0-vacuum', section: 'measured',
    label: { ru: 'Электрическая постоянная ε₀', en: 'Vacuum permittivity ε₀' },
    hint: { ru: 'ε₀ = 8.8541878188(14)·10⁻¹² Ф/м', en: 'ε₀ = 8.8541878188(14)×10⁻¹² F/m' },
    code: 'eps_0',
    sources: [NIST],
  },
  {
    id: 'z0-impedance', section: 'measured',
    label: { ru: 'Волновое сопротивление вакуума Z₀', en: 'Vacuum impedance Z₀' },
    hint: { ru: 'Z₀ = 376.730313412(59) Ом', en: 'Z₀ = 376.730313412(59) Ω' },
    code: 'Z_0',
    sources: [NIST],
  },
  {
    id: 'alpha-fine', section: 'measured',
    label: { ru: 'Постоянная тонкой структуры α', en: 'Fine-structure constant α' },
    hint: { ru: 'α = 7.2973525643(11)·10⁻³', en: 'α = 7.2973525643(11)×10⁻³' },
    code: 'alpha',
    sources: [NIST],
  },
  {
    id: 'alpha-inv', section: 'measured',
    label: { ru: 'Обратная α⁻¹', en: 'Inverse α⁻¹' },
    hint: { ru: 'α⁻¹ = 137.035999177(21)', en: 'α⁻¹ = 137.035999177(21)' },
    code: 'alpha_inv',
    sources: [NIST],
  },
  {
    id: 'g-newton', section: 'measured',
    label: { ru: 'Гравитационная постоянная G', en: 'Newtonian constant G' },
    hint: { ru: 'G = 6.67430(15)·10⁻¹¹ м³/(кг·с²)', en: 'G = 6.67430(15)×10⁻¹¹ m³/(kg·s²)' },
    code: 'G_const',
    sources: [NIST],
  },
  {
    id: 'm-electron', section: 'measured',
    label: { ru: 'Масса электрона m_e', en: 'Electron mass m_e' },
    hint: { ru: 'm_e = 9.1093837139(28)·10⁻³¹ кг', en: 'm_e = 9.1093837139(28)×10⁻³¹ kg' },
    code: 'm_e',
    sources: [NIST],
  },
  {
    id: 'm-proton', section: 'measured',
    label: { ru: 'Масса протона m_p', en: 'Proton mass m_p' },
    hint: { ru: 'm_p = 1.67262192595(52)·10⁻²⁷ кг', en: 'm_p = 1.67262192595(52)×10⁻²⁷ kg' },
    code: 'm_p',
    sources: [NIST],
  },
  {
    id: 'm-neutron', section: 'measured',
    label: { ru: 'Масса нейтрона m_n', en: 'Neutron mass m_n' },
    hint: { ru: 'm_n = 1.67492750056(85)·10⁻²⁷ кг', en: 'm_n = 1.67492750056(85)×10⁻²⁷ kg' },
    code: 'm_n',
    sources: [NIST],
  },
  {
    id: 'u-mass', section: 'measured',
    label: { ru: 'Атомная единица массы u', en: 'Atomic mass unit u' },
    hint: { ru: 'u = 1.66053906892(52)·10⁻²⁷ кг', en: 'u = 1.66053906892(52)×10⁻²⁷ kg' },
    code: 'u_mass',
    sources: [NIST],
  },
  {
    id: 'mu-bohr', section: 'measured',
    label: { ru: 'Магнетон Бора μ_B', en: 'Bohr magneton μ_B' },
    hint: { ru: 'μ_B = 9.2740100657(29)·10⁻²⁴ Дж/Тл', en: 'μ_B = 9.2740100657(29)×10⁻²⁴ J/T' },
    code: 'mu_B',
    sources: [NIST],
  },
  {
    id: 'mu-nuclear', section: 'measured',
    label: { ru: 'Ядерный магнетон μ_N', en: 'Nuclear magneton μ_N' },
    hint: { ru: 'μ_N = 5.0507837393(16)·10⁻²⁷ Дж/Тл', en: 'μ_N = 5.0507837393(16)×10⁻²⁷ J/T' },
    code: 'mu_N',
    sources: [NIST],
  },
  {
    id: 'r-rydberg', section: 'measured',
    label: { ru: 'Постоянная Ридберга R_∞', en: 'Rydberg constant R_∞' },
    hint: { ru: 'R_∞ = 10 973 731.568157(12) м⁻¹', en: 'R_∞ = 10 973 731.568157(12) m⁻¹' },
    code: 'R_inf',
    sources: [NIST],
  },
  {
    id: 'a0-bohr', section: 'measured',
    label: { ru: 'Боровский радиус a₀', en: 'Bohr radius a₀' },
    hint: { ru: 'a₀ = 5.29177210544(82)·10⁻¹¹ м', en: 'a₀ = 5.29177210544(82)×10⁻¹¹ m' },
    code: 'a0',
    sources: [NIST],
  },
  {
    id: 're-electron', section: 'measured',
    label: { ru: 'Классический радиус электрона r_e', en: 'Classical electron radius r_e' },
    hint: { ru: 'r_e = 2.8179403205(13)·10⁻¹⁵ м', en: 'r_e = 2.8179403205(13)×10⁻¹⁵ m' },
    code: 'r_e',
    sources: [NIST],
  },
  {
    id: 'lam-compton', section: 'measured',
    label: { ru: 'Комптоновская длина волны электрона λ_C', en: 'Electron Compton wavelength λ_C' },
    hint: { ru: 'λ_C = 2.42631023538(76)·10⁻¹² м', en: 'λ_C = 2.42631023538(76)×10⁻¹² m' },
    code: 'lam_compton',
    sources: [NIST],
  },
  // ================= СТАНДАРТЫ И АСТРОНОМИЯ =================
  {
    id: 'g-standard', section: 'standards',
    label: { ru: 'Стандартное ускорение свободного падения g', en: 'Standard gravity g' },
    hint: { ru: 'g = 9.80665 м/с² · определение', en: 'g = 9.80665 m/s² · definition' },
    code: 'g_std',
    sources: [NIST],
  },
  {
    id: 'atm-standard', section: 'standards',
    label: { ru: 'Стандартная атмосфера atm', en: 'Standard atmosphere atm' },
    hint: { ru: '1 атм = 101 325 Па · определение', en: '1 atm = 101 325 Pa · definition' },
    code: 'atm_pa',
    sources: [NIST],
  },
  {
    id: 'au-astronomical', section: 'standards',
    label: { ru: 'Астрономическая единица au', en: 'Astronomical unit au' },
    hint: { ru: '1 au = 1.495978707·10¹¹ м · МАС', en: '1 au = 1.495978707×10¹¹ m · IAU' },
    code: 'au_m',
    sources: [NIST],
  },
  {
    id: 'ly-lightyear', section: 'standards',
    label: { ru: 'Световой год ly', en: 'Light-year ly' },
    hint: { ru: '1 ly = 9.4607304725808·10¹⁵ м · определение', en: '1 ly = 9.4607304725808×10¹⁵ m · definition' },
    code: 'ly_m',
    sources: [NIST],
  },
];