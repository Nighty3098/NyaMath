import type { LText } from '../i18n';

/** Переменная формулы: имя в коде + что обозначает (RU/EN). */
export interface FormulaVar {
  name: string;
  label: LText;
}

const V = (name: string, ru: string, en: string): FormulaVar => ({ name, label: { ru, en } });

/**
 * Легенда переменных по id формулы. Ключи обязаны совпадать с Formula.id,
 * имена — встречаться в коде формулы (проверяется тестом formulas.test.ts).
 * Формулы без присваиваний (чистые вычисления) легенды не имеют.
 */
export const FORMULA_VARS: Record<string, FormulaVar[]> = {
  // ================= МЕХАНИКА · КИНЕМАТИКА =================
  'vel-uniform': [
    V('v', 'скорость', 'velocity'),
    V('t', 'время', 'time'),
    V('s', 'путь', 'distance'),
  ],
  'vel-uniform-eq': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('a_acc', 'ускорение', 'acceleration'),
    V('t_s', 'время', 'time'),
    V('s_dist', 'путь', 'distance'),
  ],
  'vel-final': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('a_acc', 'ускорение', 'acceleration'),
    V('s_dist', 'путь', 'distance'),
    V('v_end', 'конечная скорость', 'final velocity'),
  ],
  'free-fall': [
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('t_s', 'время', 'time'),
    V('h_fall', 'высота падения', 'fall height'),
  ],
  'free-fall-v': [
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('t_s', 'время', 'time'),
    V('v_end', 'конечная скорость', 'final velocity'),
  ],
  'throw-up': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('H_max', 'максимальная высота', 'maximum height'),
    V('t_up', 'время полёта', 'flight time'),
  ],
  'throw-angle': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('alpha', 'угол броска', 'launch angle'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('R_range', 'дальность', 'range'),
  ],
  'throw-angle-h': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('alpha', 'угол броска', 'launch angle'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('H_max', 'максимальная высота', 'maximum height'),
  ],
  'throw-angle-t': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('alpha', 'угол броска', 'launch angle'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('t_flight', 'время полёта', 'flight time'),
  ],
  'horiz-throw': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('H_cl', 'высота', 'height'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('t_fall', 'время падения', 'fall time'),
    V('R_rng', 'дальность', 'range'),
  ],
  'angular-vel': [
    V('f_hz', 'частота', 'frequency'),
    V('w_ang', 'угловая скорость', 'angular velocity'),
    V('T_per', 'период', 'period'),
  ],
  'lin-ang': [
    V('w_ang', 'угловая скорость', 'angular velocity'),
    V('r_rad', 'радиус', 'radius'),
    V('v_lin', 'линейная скорость', 'linear velocity'),
  ],
  'ang-accel': [
    V('w1', 'начальная угловая скорость', 'initial angular velocity'),
    V('w2', 'конечная угловая скорость', 'final angular velocity'),
    V('t_s', 'время', 'time'),
    V('a_ang', 'угловое ускорение', 'angular acceleration'),
    V('theta_rot', 'угол поворота', 'rotation angle'),
  ],
  'average-vel': [
    V('s1', 'путь 1', 'distance 1'),
    V('s2', 'путь 2', 'distance 2'),
    V('t1', 'время 1', 'time 1'),
    V('t2', 'время 2', 'time 2'),
    V('v_avg', 'средняя скорость', 'average velocity'),
  ],
  'braking': [
    V('v0', 'начальная скорость', 'initial velocity'),
    V('v_end', 'конечная скорость', 'final velocity'),
    V('t_s', 'время', 'time'),
    V('a_dec', 'замедление', 'deceleration'),
    V('s_stop', 'тормозной путь', 'stopping distance'),
  ],
  'rot-freq': [
    V('N_rev', 'число оборотов', 'number of revolutions'),
    V('t_s', 'время', 'time'),
    V('n_rev', 'частота вращения', 'rotation frequency'),
  ],
  'v-from-w-r': [
    V('r_rad', 'радиус', 'radius'),
    V('T_per', 'период', 'period'),
    V('v_rim', 'скорость обода', 'rim speed'),
  ],
  'wheel-ang-path': [
    V('phi_rot', 'угол поворота', 'rotation angle'),
    V('r_rad', 'радиус', 'radius'),
    V('s_arc', 'длина дуги', 'arc length'),
  ],
  'relative-vel': [
    V('v1', 'скорость 1', 'velocity 1'),
    V('v2', 'скорость 2', 'velocity 2'),
    V('v_rel', 'относительная скорость', 'relative velocity'),
  ],
  'tangential-accel': [
    V('eps_ang', 'угловое ускорение', 'angular acceleration'),
    V('r_rad', 'радиус', 'radius'),
    V('a_tan', 'тангенциальное ускорение', 'tangential acceleration'),
  ],
  'normal-accel': [
    V('w_ang', 'угловая скорость', 'angular velocity'),
    V('r_rad', 'радиус', 'radius'),
    V('a_nor', 'нормальное ускорение', 'normal acceleration'),
  ],
  'full-accel-rot': [
    V('a_t', 'тангенциальное ускорение', 'tangential acceleration'),
    V('a_n', 'нормальное ускорение', 'normal acceleration'),
    V('a_full', 'полное ускорение', 'total acceleration'),
  ],
  // ================= МЕХАНИКА · ДИНАМИКА =================
  'newton2': [
    V('m_kg', 'масса', 'mass'),
    V('F_net', 'сила', 'force'),
    V('a_acc', 'ускорение', 'acceleration'),
  ],
  'weight': [
    V('m_kg', 'масса', 'mass'),
    V('P_w', 'вес', 'weight'),
  ],
  'momentum-p': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('p_mom', 'импульс', 'momentum'),
  ],
  'impulse': [
    V('F_net', 'сила', 'force'),
    V('dt_t', 'интервал времени', 'time interval'),
    V('dp_imp', 'изменение импульса', 'change of momentum'),
  ],
  'inelastic-collision': [
    V('m1', 'масса 1', 'mass 1'),
    V('v1', 'скорость 1', 'velocity 1'),
    V('m2', 'масса 2', 'mass 2'),
    V('v2', 'скорость 2', 'velocity 2'),
    V('v_after', 'общая скорость', 'common velocity'),
  ],
  'elastic-collision': [
    V('m1', 'масса 1', 'mass 1'),
    V('v1', 'скорость 1 до удара', 'velocity 1 before'),
    V('m2', 'масса 2', 'mass 2'),
    V('v2', 'скорость 2 до удара', 'velocity 2 before'),
    V('v1_after', 'скорость 1 после удара', 'velocity 1 after'),
    V('v2_after', 'скорость 2 после удара', 'velocity 2 after'),
  ],
  'restitution-collision': [
    V('m1', 'масса 1', 'mass 1'),
    V('v1', 'скорость 1 до удара', 'velocity 1 before'),
    V('m2', 'масса 2', 'mass 2'),
    V('v2', 'скорость 2 до удара', 'velocity 2 before'),
    V('e_rest', 'коэффициент восстановления материала', 'material restitution coefficient'),
    V('v1_after', 'скорость 1 после удара', 'velocity 1 after'),
    V('v2_after', 'скорость 2 после удара', 'velocity 2 after'),
  ],
  'ball-mass-density': [
    V('rho_m', 'плотность материала', 'material density'),
    V('r_bl', 'радиус шара', 'ball radius'),
    V('m_bl', 'масса шара', 'ball mass'),
  ],
  'friction': [
    V('m_kg', 'масса', 'mass'),
    V('mu_f', 'коэффициент трения', 'friction coefficient'),
    V('F_fric', 'сила трения', 'friction force'),
  ],
  'incline-normal': [
    V('m_kg', 'масса', 'mass'),
    V('alpha_ang', 'угол наклона', 'incline angle'),
    V('N_norm', 'реакция опоры', 'normal force'),
  ],
  'incline-slide': [
    V('m_kg', 'масса', 'mass'),
    V('alpha_ang', 'угол наклона', 'incline angle'),
    V('mu_f', 'коэффициент трения', 'friction coefficient'),
    V('F_slide', 'равнодействующая сила', 'net force'),
  ],
  'hooke': [
    V('k_spr', 'жёсткость', 'stiffness'),
    V('x_el', 'удлинение', 'extension'),
    V('F_hooke', 'сила упругости', 'elastic force'),
  ],
  'work-const': [
    V('F_app', 'приложенная сила', 'applied force'),
    V('d_dist', 'перемещение', 'displacement'),
    V('phi_ang', 'угол между силой и перемещением', 'angle between force and displacement'),
    V('W_work', 'работа', 'work'),
  ],
  'power-avg': [
    V('W_work', 'работа', 'work'),
    V('dt_t', 'время', 'time'),
    V('P_pow', 'мощность', 'power'),
  ],
  'kin-energy': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('E_kin', 'кинетическая энергия', 'kinetic energy'),
  ],
  'pot-energy': [
    V('m_kg', 'масса', 'mass'),
    V('H_h', 'высота', 'height'),
    V('E_pot', 'потенциальная энергия', 'potential energy'),
  ],
  'mech-energy': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('H_h', 'высота', 'height'),
    V('E_total', 'полная энергия', 'total energy'),
  ],
  'centripetal-a': [
    V('v_vel', 'скорость', 'velocity'),
    V('r_rad', 'радиус', 'radius'),
    V('a_cent', 'центростремительное ускорение', 'centripetal acceleration'),
  ],
  'centripetal-f': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('r_rad', 'радиус', 'radius'),
    V('F_cent', 'центростремительная сила', 'centripetal force'),
  ],
  'torque': [
    V('F_f', 'сила', 'force'),
    V('L_arm', 'плечо', 'lever arm'),
    V('M_torque', 'момент силы', 'torque'),
  ],
  'ang-momentum': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('r_rad', 'радиус', 'radius'),
    V('L_ang', 'момент импульса', 'angular momentum'),
  ],
  'universal-grav': [
    V('m1', 'масса 1', 'mass 1'),
    V('m2', 'масса 2', 'mass 2'),
    V('r_or', 'расстояние между центрами', 'center distance'),
    V('F_gr', 'сила тяготения', 'gravitational force'),
  ],
  'orbit-v1': [
    V('M_p', 'масса планеты', 'planet mass'),
    V('r_or', 'радиус орбиты', 'orbit radius'),
    V('v1', 'орбитальная скорость', 'orbital velocity'),
  ],
  'g-planet': [
    V('M_p', 'масса планеты', 'planet mass'),
    V('r_or', 'радиус планеты', 'planet radius'),
    V('g_p', 'ускорение свободного падения', 'surface gravity'),
  ],
  'pressure-force': [
    V('F_p', 'сила', 'force'),
    V('A_ar', 'площадь', 'area'),
    V('p_pres', 'давление', 'pressure'),
  ],
  'hydrostatic': [
    V('rho_f', 'плотность жидкости', 'fluid density'),
    V('H_h', 'высота столба жидкости', 'fluid column height'),
    V('p_hyd', 'гидростатическое давление', 'hydrostatic pressure'),
  ],
  'archimedes': [
    V('rho_f', 'плотность жидкости', 'fluid density'),
    V('V_b', 'объём погружённой части', 'submerged volume'),
    V('F_arch', 'сила Архимеда', 'buoyant force'),
  ],
  'pascal-law': [
    V('F1', 'сила 1', 'force 1'),
    V('A1', 'площадь 1', 'area 1'),
    V('A2', 'площадь 2', 'area 2'),
    V('F2', 'сила 2', 'force 2'),
  ],
  // ================= МКТ И ТЕРМОДИНАМИКА =================
  'ideal-gas': [
    V('n_mol', 'количество вещества', 'amount of substance'),
    V('T_k', 'температура', 'temperature'),
    V('V_v', 'объём', 'volume'),
    V('P_pres', 'давление', 'pressure'),
  ],
  'gas-n-pv': [
    V('P_p', 'давление', 'pressure'),
    V('V_v', 'объём', 'volume'),
    V('T_k', 'температура', 'temperature'),
    V('n_mol', 'количество вещества', 'amount of substance'),
  ],
  'boyle-law': [
    V('P1', 'давление 1', 'pressure 1'),
    V('V1', 'объём 1', 'volume 1'),
    V('V2', 'объём 2', 'volume 2'),
    V('P2', 'давление 2', 'pressure 2'),
  ],
  'gay-lussac-v': [
    V('V1', 'объём 1', 'volume 1'),
    V('T1', 'температура 1', 'temperature 1'),
    V('T2', 'температура 2', 'temperature 2'),
    V('V2', 'объём 2', 'volume 2'),
  ],
  'p-nkT': [
    V('n_m3', 'концентрация молекул', 'molecule concentration'),
    V('T_k', 'температура', 'temperature'),
    V('p_press', 'давление', 'pressure'),
  ],
  'v-rms': [
    V('T_k', 'температура', 'temperature'),
    V('m0', 'масса молекулы', 'molecule mass'),
    V('v_rms', 'среднеквадратичная скорость', 'root-mean-square speed'),
  ],
  'e-avg': [
    V('T_k', 'температура', 'temperature'),
    V('E_avg', 'средняя энергия', 'average energy'),
  ],
  'moles-from-mass': [
    V('m_kg', 'масса', 'mass'),
    V('M_kg', 'молярная масса', 'molar mass'),
    V('n_mol', 'количество вещества', 'amount of substance'),
  ],
  'n-from-na': [
    V('n_mol', 'количество вещества', 'amount of substance'),
    V('N_cnt', 'число молекул', 'number of molecules'),
  ],
  'q-heat': [
    V('c_c', 'удельная теплоёмкость', 'specific heat'),
    V('m_kg', 'масса', 'mass'),
    V('dT', 'изменение температуры', 'temperature change'),
    V('Q_heat', 'теплота', 'heat'),
  ],
  'q-fusion': [
    V('lam_fus', 'удельная теплота плавления', 'specific heat of fusion'),
    V('m_kg', 'масса', 'mass'),
    V('Q_f', 'теплота плавления', 'heat of fusion'),
  ],
  'q-vapor': [
    V('L_vap', 'удельная теплота парообразования', 'specific heat of vaporization'),
    V('m_kg', 'масса', 'mass'),
    V('Q_vap', 'теплота парообразования', 'heat of vaporization'),
  ],
  'q-fuel': [
    V('q_fuel', 'удельная теплота сгорания', 'specific heat of combustion'),
    V('m_kg', 'масса', 'mass'),
    V('Q_c', 'теплота сгорания', 'combustion heat'),
  ],
  'first-law': [
    V('Q_p', 'подведённая теплота', 'heat added'),
    V('dU', 'изменение внутренней энергии', 'internal energy change'),
    V('W_by', 'работа газа', 'work by gas'),
  ],
  'work-isobar': [
    V('P_p', 'давление', 'pressure'),
    V('dV', 'изменение объёма', 'volume change'),
    V('W_gas', 'работа газа', 'work by gas'),
  ],
  'efficiency': [
    V('Q1', 'теплота нагревателя', 'heater heat'),
    V('Q2', 'теплота холодильника', 'cooler heat'),
    V('eta_e', 'КПД', 'efficiency'),
  ],
  'carnot': [
    V('T1', 'температура нагревателя', 'heater temperature'),
    V('T2', 'температура холодильника', 'cooler temperature'),
    V('eta_c', 'КПД Карно', 'Carnot efficiency'),
  ],
  'adiabatic': [
    V('P1', 'давление 1', 'pressure 1'),
    V('V1', 'объём 1', 'volume 1'),
    V('gam_ad', 'показатель адиабаты', 'adiabatic index'),
    V('V2', 'объём 2', 'volume 2'),
    V('P2', 'давление 2', 'pressure 2'),
  ],
  'thermo-expand': [
    V('L0', 'начальная длина', 'initial length'),
    V('alpha_lin', 'коэффициент расширения', 'expansion coefficient'),
    V('dT', 'изменение температуры', 'temperature change'),
    V('dL', 'удлинение', 'extension'),
  ],
  'dalton-law': [
    V('P1', 'парциальное давление 1', 'partial pressure 1'),
    V('P2', 'парциальное давление 2', 'partial pressure 2'),
    V('P_mix', 'общее давление', 'total pressure'),
  ],
  'humidity': [
    V('p_vap', 'давление пара', 'vapor pressure'),
    V('p_sat', 'давление насыщения', 'saturation pressure'),
    V('phi_h', 'влажность, %', 'humidity, %'),
  ],
  'heat-balance': [
    V('m1', 'масса 1', 'mass 1'),
    V('T1', 'температура 1', 'temperature 1'),
    V('m2', 'масса 2', 'mass 2'),
    V('T2', 'температура 2', 'temperature 2'),
    V('T_mix', 'температура смеси', 'mixture temperature'),
  ],
  // ================= ЭЛЕКТРОСТАТИКА =================
  'coulomb': [
    V('q1', 'заряд 1', 'charge 1'),
    V('q2', 'заряд 2', 'charge 2'),
    V('r_c', 'расстояние', 'distance'),
    V('F_c', 'сила Кулона', 'Coulomb force'),
  ],
  'e-field-point': [
    V('q_pt', 'точечный заряд', 'point charge'),
    V('r_pt', 'расстояние', 'distance'),
    V('E_f', 'напряжённость', 'field strength'),
  ],
  'potential-point': [
    V('q_pt', 'точечный заряд', 'point charge'),
    V('r_pt', 'расстояние', 'distance'),
    V('phi_pot', 'потенциал', 'potential'),
  ],
  'voltage-work': [
    V('A_field', 'работа поля', 'field work'),
    V('q_mv', 'переносимый заряд', 'moved charge'),
    V('U_v', 'напряжение', 'voltage'),
  ],
  'capacitance-def': [
    V('C_c', 'ёмкость', 'capacitance'),
    V('U_c', 'напряжение', 'voltage'),
    V('Q_charge', 'заряд', 'charge'),
  ],
  'cap-parallel-plate': [
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('S_ar', 'площадь пластин', 'plate area'),
    V('d_gap', 'зазор', 'gap'),
    V('C_cap', 'ёмкость', 'capacitance'),
  ],
  'cap-series': [
    V('C1', 'ёмкость 1', 'capacitance 1'),
    V('C2', 'ёмкость 2', 'capacitance 2'),
    V('C_ser', 'общая ёмкость', 'total capacitance'),
  ],
  'cap-parallel': [
    V('C1', 'ёмкость 1', 'capacitance 1'),
    V('C2', 'ёмкость 2', 'capacitance 2'),
    V('C_par', 'общая ёмкость', 'total capacitance'),
  ],
  'cap-energy': [
    V('C_c', 'ёмкость', 'capacitance'),
    V('U_c', 'напряжение', 'voltage'),
    V('W_cap', 'энергия', 'energy'),
  ],
  'field-energy-density': [
    V('E_f', 'напряжённость', 'field strength'),
    V('w_dens', 'плотность энергии', 'energy density'),
  ],
  'field-parallel-plates': [
    V('U_v', 'напряжение', 'voltage'),
    V('d_gap', 'зазор', 'gap'),
    V('E_f', 'напряжённость', 'field strength'),
  ],
  'ohm-def': [
    V('phi1', 'потенциал 1', 'potential 1'),
    V('phi2', 'потенциал 2', 'potential 2'),
    V('d_gap', 'расстояние', 'distance'),
    V('E_f', 'напряжённость', 'field strength'),
  ],
  'cap-eps-up': [
    V('C0', 'ёмкость без диэлектрика', 'vacuum capacitance'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('C_die', 'ёмкость с диэлектриком', 'dielectric capacitance'),
  ],
  'dielectric-force-fix': [
    V('F0', 'сила в вакууме', 'vacuum force'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('F_die', 'сила в диэлектрике', 'force in dielectric'),
  ],
  'charge-quantum': [
    V('N_el', 'число электронов', 'number of electrons'),
    V('q_n', 'заряд', 'charge'),
  ],
  'electron-deflection': [
    V('E_f', 'напряжённость', 'field strength'),
    V('m_kg', 'масса электрона', 'electron mass'),
    V('a_defl', 'ускорение', 'acceleration'),
  ],
  'cap-charge-share': [
    V('C1', 'ёмкость 1', 'capacitance 1'),
    V('C2', 'ёмкость 2', 'capacitance 2'),
    V('U1', 'напряжение 1', 'voltage 1'),
    V('U2', 'напряжение 2', 'voltage 2'),
    V('U_res', 'общее напряжение', 'common voltage'),
  ],
  'dipole-moment': [
    V('q_dp', 'заряд диполя', 'dipole charge'),
    V('l_dp', 'плечо диполя', 'dipole separation'),
    V('p_dp', 'дипольный момент', 'dipole moment'),
  ],
  'dipole-axis-field': [
    V('p_dp', 'дипольный момент', 'dipole moment'),
    V('r_pt', 'расстояние', 'distance'),
    V('E_dp', 'поле диполя', 'dipole field'),
  ],
  'plane-field': [
    V('q_pl', 'заряд плоскости', 'plane charge'),
    V('S_pl', 'площадь', 'area'),
    V('sig_pl', 'поверхностная плотность заряда', 'surface charge density'),
    V('E_pl', 'напряжённость', 'field strength'),
  ],
  'two-plates-field': [
    V('sig_pl', 'поверхностная плотность заряда', 'surface charge density'),
    V('E_2pl', 'поле между пластинами', 'field between plates'),
  ],
  'electron-speed-voltage': [
    V('U_v', 'напряжение', 'voltage'),
    V('m_kg', 'масса электрона', 'electron mass'),
    V('v_el', 'скорость электрона', 'electron speed'),
  ],
  // ================= ПОСТОЯННЫЙ ТОК =================
  'ohm-law': [
    V('U_v', 'напряжение', 'voltage'),
    V('R_r', 'сопротивление', 'resistance'),
    V('I_c', 'ток', 'current'),
  ],
  'power-dc': [
    V('U_v', 'напряжение', 'voltage'),
    V('I_c', 'ток', 'current'),
    V('P_dc', 'мощность', 'power'),
  ],
  'power-ri': [
    V('I_c', 'ток', 'current'),
    V('R_r', 'сопротивление', 'resistance'),
    V('P_ri', 'мощность', 'power'),
  ],
  'joule-heat': [
    V('I_c', 'ток', 'current'),
    V('R_r', 'сопротивление', 'resistance'),
    V('dt_t', 'время', 'time'),
    V('Q_j', 'теплота', 'heat'),
  ],
  'work-current': [
    V('U_v', 'напряжение', 'voltage'),
    V('I_c', 'ток', 'current'),
    V('dt_t', 'время', 'time'),
    V('A_dc', 'работа тока', 'work of current'),
  ],
  'res-series': [
    V('R1', 'сопротивление 1', 'resistance 1'),
    V('R2', 'сопротивление 2', 'resistance 2'),
    V('R_ser', 'общее сопротивление', 'total resistance'),
  ],
  'res-parallel': [
    V('R1', 'сопротивление 1', 'resistance 1'),
    V('R2', 'сопротивление 2', 'resistance 2'),
    V('R_par', 'общее сопротивление', 'total resistance'),
  ],
  'voltage-divider': [
    V('U_in', 'входное напряжение', 'input voltage'),
    V('R1', 'сопротивление 1', 'resistance 1'),
    V('R2', 'сопротивление 2', 'resistance 2'),
    V('U2', 'выходное напряжение', 'output voltage'),
  ],
  'current-divider': [
    V('I_in', 'входной ток', 'input current'),
    V('R1', 'сопротивление 1', 'resistance 1'),
    V('R2', 'сопротивление 2', 'resistance 2'),
    V('I1', 'ток ветви', 'branch current'),
  ],
  'emf-terminal': [
    V('E_emf', 'ЭДС', 'EMF'),
    V('I_c', 'ток', 'current'),
    V('r_in', 'внутреннее сопротивление', 'internal resistance'),
    V('U_term', 'напряжение на клеммах', 'terminal voltage'),
  ],
  'short-circuit': [
    V('E_emf', 'ЭДС', 'EMF'),
    V('r_in', 'внутреннее сопротивление', 'internal resistance'),
    V('I_sc', 'ток короткого замыкания', 'short-circuit current'),
  ],
  'source-efficiency': [
    V('R_ld', 'сопротивление нагрузки', 'load resistance'),
    V('r_in', 'внутреннее сопротивление', 'internal resistance'),
    V('eta_s', 'КПД', 'efficiency'),
  ],
  'max-power-transfer': [
    V('E_emf', 'ЭДС', 'EMF'),
    V('r_in', 'внутреннее сопротивление', 'internal resistance'),
    V('P_max', 'максимальная мощность', 'maximum power'),
  ],
  'resistivity': [
    V('rho_cu', 'удельное сопротивление', 'resistivity'),
    V('len_w', 'длина провода', 'wire length'),
    V('S_w', 'сечение', 'cross-section'),
    V('R_wr', 'сопротивление провода', 'wire resistance'),
  ],
  'res-temp': [
    V('R0', 'начальное сопротивление', 'initial resistance'),
    V('alpha_t', 'температурный коэффициент', 'temperature coefficient'),
    V('dT', 'изменение температуры', 'temperature change'),
    V('R_hot', 'нагретое сопротивление', 'heated resistance'),
  ],
  'kirchhoff-node': [
    V('I1', 'ток 1', 'current 1'),
    V('I2', 'ток 2', 'current 2'),
    V('I_nd', 'суммарный ток', 'total current'),
  ],
  'rc-tau': [
    V('R_r', 'сопротивление', 'resistance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('tau_rc', 'постоянная времени', 'time constant'),
  ],
  'rc-discharge': [
    V('U0', 'начальное напряжение', 'initial voltage'),
    V('R_r', 'сопротивление', 'resistance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('dt_t', 'время', 'time'),
    V('U_rc', 'текущее напряжение', 'present voltage'),
  ],
  'ind-energy': [
    V('L_in', 'индуктивность', 'inductance'),
    V('I_c', 'ток', 'current'),
    V('W_ind', 'энергия', 'energy'),
  ],
  'thomson-freq': [
    V('L_in', 'индуктивность', 'inductance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('f_lc', 'резонансная частота', 'resonant frequency'),
  ],
  'reactance-xl-xc': [
    V('f_hz', 'частота', 'frequency'),
    V('L_in', 'индуктивность', 'inductance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('Xl', 'индуктивное сопротивление', 'inductive reactance'),
    V('Xc', 'ёмкостное сопротивление', 'capacitive reactance'),
  ],
  'impedance-rlc': [
    V('R_r', 'сопротивление', 'resistance'),
    V('Xl', 'индуктивное сопротивление', 'inductive reactance'),
    V('Xc', 'ёмкостное сопротивление', 'capacitive reactance'),
    V('Z_rlc', 'импеданс', 'impedance'),
  ],
  // ================= МАГНЕТИЗМ =================
  'ampere-force': [
    V('I_c', 'ток', 'current'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('L_w', 'длина провода', 'wire length'),
    V('alpha', 'угол', 'angle'),
    V('F_amp', 'сила Ампера', 'Ampere force'),
  ],
  'lorentz-force': [
    V('v_vel', 'скорость частицы', 'particle velocity'),
    V('alpha', 'угол', 'angle'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('F_lor', 'сила Лоренца', 'Lorentz force'),
  ],
  'cyclotron-radius': [
    V('m_kg', 'масса частицы', 'particle mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('r_cyc', 'радиус траектории', 'trajectory radius'),
  ],
  'cyclotron-period': [
    V('m_kg', 'масса частицы', 'particle mass'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('T_cyc', 'период обращения', 'gyration period'),
  ],
  'cyclotron-freq': [
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('m_kg', 'масса частицы', 'particle mass'),
    V('f_cyc', 'циклотронная частота', 'cyclotron frequency'),
  ],
  'wire-field': [
    V('I_c', 'ток', 'current'),
    V('r_pt', 'расстояние', 'distance'),
    V('B_wr', 'поле провода', 'wire field'),
  ],
  'loop-center-field': [
    V('I_c', 'ток', 'current'),
    V('R_lp', 'радиус витка', 'loop radius'),
    V('B_lp', 'поле в центре', 'center field'),
  ],
  'solenoid-field': [
    V('N_tr', 'число витков', 'number of turns'),
    V('I_c', 'ток', 'current'),
    V('L_sl', 'длина соленоида', 'solenoid length'),
    V('B_sl', 'поле соленоида', 'solenoid field'),
  ],
  'toroid-field': [
    V('N_tr', 'число витков', 'number of turns'),
    V('I_c', 'ток', 'current'),
    V('r_tr', 'радиус тора', 'torus radius'),
    V('B_tr', 'поле тороида', 'toroid field'),
  ],
  'mag-flux': [
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('S_ar', 'площадь', 'area'),
    V('alpha', 'угол', 'angle'),
    V('Phi_m', 'магнитный поток', 'magnetic flux'),
  ],
  'faraday-emf': [
    V('N_tr', 'число витков', 'number of turns'),
    V('dPhi', 'изменение потока', 'flux change'),
    V('dt_t', 'время', 'time'),
    V('E_ind', 'ЭДС индукции', 'induced EMF'),
  ],
  'motional-emf': [
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('len_c', 'длина проводника', 'conductor length'),
    V('v_vel', 'скорость', 'velocity'),
    V('E_mot', 'ЭДС движения', 'motional EMF'),
  ],
  'self-induction': [
    V('L_in', 'индуктивность', 'inductance'),
    V('dI', 'изменение тока', 'current change'),
    V('dt_t', 'время', 'time'),
    V('E_self', 'ЭДС самоиндукции', 'self-induced EMF'),
  ],
  'mag-energy': [
    V('L_in', 'индуктивность', 'inductance'),
    V('I_c', 'ток', 'current'),
    V('W_mag', 'энергия', 'energy'),
  ],
  'mag-energy-density': [
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('w_mag', 'плотность энергии', 'energy density'),
  ],
  'loop-torque': [
    V('N_tr', 'число витков', 'number of turns'),
    V('I_c', 'ток', 'current'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('S_ar', 'площадь', 'area'),
    V('alpha', 'угол', 'angle'),
    V('M_lp', 'вращающий момент', 'torque'),
  ],
  'loop-moment': [
    V('I_c', 'ток', 'current'),
    V('S_ar', 'площадь', 'area'),
    V('pm_lp', 'магнитный момент', 'magnetic moment'),
  ],
  'parallel-wires-force': [
    V('I1', 'ток 1', 'current 1'),
    V('I2', 'ток 2', 'current 2'),
    V('L_w', 'длина', 'length'),
    V('d_wr', 'расстояние между проводами', 'distance between wires'),
    V('F_ww', 'сила взаимодействия', 'interaction force'),
  ],
  'hall-voltage': [
    V('I_c', 'ток', 'current'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('n_cn', 'концентрация носителей', 'carrier concentration'),
    V('d_th', 'толщина пластины', 'plate thickness'),
    V('U_hall', 'напряжение Холла', 'Hall voltage'),
  ],
  'b-from-h': [
    V('mu_r', 'магнитная проницаемость', 'permeability'),
    V('H_f', 'напряжённость магнитного поля', 'magnetic field strength'),
    V('B_mt', 'магнитная индукция', 'magnetic induction'),
  ],
  'solenoid-inductance': [
    V('N_tr', 'число витков', 'number of turns'),
    V('S_ar', 'площадь сечения', 'cross-section'),
    V('L_sl', 'длина соленоида', 'solenoid length'),
    V('L_sl2', 'индуктивность', 'inductance'),
  ],
  'mag-charge-period-check': [
    V('m_kg', 'масса частицы', 'particle mass'),
    V('v_par', 'продольная скорость', 'longitudinal velocity'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('T_gy', 'период обращения', 'gyration period'),
    V('h_step', 'шаг спирали', 'helix step'),
  ],
  // ================= КОЛЕБАНИЯ И ВОЛНЫ =================
  'shm-displacement': [
    V('A_m', 'амплитуда', 'amplitude'),
    V('w_0', 'циклическая частота', 'angular frequency'),
    V('t_s', 'время', 'time'),
    V('phi_0', 'начальная фаза', 'initial phase'),
    V('x_sh', 'смещение', 'displacement'),
  ],
  'spring-period': [
    V('m_kg', 'масса', 'mass'),
    V('k_spr', 'жёсткость', 'stiffness'),
    V('T_spr', 'период', 'period'),
  ],
  'spring-freq': [
    V('m_kg', 'масса', 'mass'),
    V('k_spr', 'жёсткость', 'stiffness'),
    V('w_0', 'собственная частота', 'natural frequency'),
    V('f_0', 'частота', 'frequency'),
  ],
  'math-pendulum': [
    V('L_pen', 'длина маятника', 'pendulum length'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('T_pen', 'период', 'period'),
  ],
  'physical-pendulum': [
    V('I_ax', 'момент инерции', 'moment of inertia'),
    V('m_kg', 'масса', 'mass'),
    V('d_cm', 'расстояние до центра масс', 'distance to center of mass'),
    V('T_ph', 'период', 'period'),
  ],
  'shm-energy': [
    V('k_spr', 'жёсткость', 'stiffness'),
    V('A_m', 'амплитуда', 'amplitude'),
    V('E_sh', 'энергия колебаний', 'oscillation energy'),
  ],
  'shm-vmax-amax': [
    V('A_m', 'амплитуда', 'amplitude'),
    V('w_0', 'циклическая частота', 'angular frequency'),
    V('v_max', 'максимальная скорость', 'maximum velocity'),
    V('a_max', 'максимальное ускорение', 'maximum acceleration'),
  ],
  'shm-velocity-at-x': [
    V('A_m', 'амплитуда', 'amplitude'),
    V('x_p', 'смещение', 'displacement'),
    V('w_0', 'циклическая частота', 'angular frequency'),
    V('v_px', 'скорость', 'velocity'),
  ],
  'freq-period': [
    V('T_per', 'период', 'period'),
    V('f_hz', 'частота', 'frequency'),
    V('w_0', 'циклическая частота', 'angular frequency'),
  ],
  'damped-q': [
    V('w_0', 'собственная частота', 'natural frequency'),
    V('beta_d', 'коэффициент затухания', 'damping coefficient'),
    V('Q_f', 'добротность', 'quality factor'),
  ],
  'resonance-amplitude': [
    V('F0', 'амплитуда силы', 'force amplitude'),
    V('m_kg', 'масса', 'mass'),
    V('w_0', 'собственная частота', 'natural frequency'),
    V('w_dr', 'частота вынуждения', 'driving frequency'),
    V('beta_d', 'коэффициент затухания', 'damping coefficient'),
    V('A_res', 'амплитуда отклика', 'response amplitude'),
  ],
  'wave-speed': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('f_hz', 'частота', 'frequency'),
    V('v_wv', 'скорость волны', 'wave speed'),
  ],
  'wave-number': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('k_wn', 'волновое число', 'wavenumber'),
  ],
  'string-wave': [
    V('F_ten', 'натяжение', 'tension'),
    V('mu_lin', 'линейная плотность', 'linear density'),
    V('v_str', 'скорость волны в струне', 'string wave speed'),
  ],
  'string-harmonics': [
    V('v_str', 'скорость волны', 'wave speed'),
    V('L_st', 'длина струны', 'string length'),
    V('n_h', 'номер гармоники', 'harmonic number'),
    V('f_h', 'частота гармоники', 'harmonic frequency'),
  ],
  'pipe-open-closed': [
    V('v_snd', 'скорость звука', 'sound speed'),
    V('L_pb', 'длина трубы', 'pipe length'),
    V('f_open', 'частота открытой трубы', 'open pipe frequency'),
    V('f_closed', 'частота закрытой трубы', 'closed pipe frequency'),
  ],
  'doppler-sound': [
    V('f_src', 'частота источника', 'source frequency'),
    V('c_snd', 'скорость звука', 'sound speed'),
    V('v_src', 'скорость источника', 'source velocity'),
    V('f_obs', 'наблюдаемая частота', 'observed frequency'),
  ],
  'beats': [
    V('f1', 'частота 1', 'frequency 1'),
    V('f2', 'частота 2', 'frequency 2'),
    V('f_beat', 'частота биений', 'beat frequency'),
  ],
  'sound-level': [
    V('I_snd', 'интенсивность', 'intensity'),
    V('I0', 'порог слышимости', 'hearing threshold'),
    V('L_db', 'уровень, дБ', 'level, dB'),
  ],
  'lc-period': [
    V('L_in', 'индуктивность', 'inductance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('T_lc', 'период контура', 'circuit period'),
  ],
  'rlc-q': [
    V('R_r', 'сопротивление', 'resistance'),
    V('L_in', 'индуктивность', 'inductance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('Q_rlc', 'добротность', 'quality factor'),
  ],
  'phase-diff': [
    V('dx_m', 'разность хода', 'path difference'),
    V('lam_w', 'длина волны', 'wavelength'),
    V('dphi', 'разность фаз', 'phase difference'),
  ],
  // ================= ОПТИКА =================
  'snell-law': [
    V('n1', 'показатель преломления 1', 'refractive index 1'),
    V('theta1', 'угол падения', 'incidence angle'),
    V('n2', 'показатель преломления 2', 'refractive index 2'),
    V('theta2', 'угол преломления', 'refraction angle'),
  ],
  'critical-angle': [
    V('n1', 'показатель преломления 1', 'refractive index 1'),
    V('n2', 'показатель преломления 2', 'refractive index 2'),
    V('C_tir', 'предельный угол', 'critical angle'),
  ],
  'thin-lens': [
    V('F_len', 'фокусное расстояние', 'focal length'),
    V('d_obj', 'расстояние до предмета', 'object distance'),
    V('f_img', 'расстояние до изображения', 'image distance'),
  ],
  'lens-magnification': [
    V('d_obj', 'расстояние до предмета', 'object distance'),
    V('f_img', 'расстояние до изображения', 'image distance'),
    V('Gamma_l', 'увеличение', 'magnification'),
  ],
  'lensmaker': [
    V('n_gl', 'показатель стекла', 'glass index'),
    V('R1', 'радиус 1', 'radius 1'),
    V('R2', 'радиус 2', 'radius 2'),
    V('F_lm', 'фокусное расстояние', 'focal length'),
  ],
  'optical-power': [
    V('F_len', 'фокусное расстояние', 'focal length'),
    V('D_opt', 'оптическая сила', 'optical power'),
  ],
  'grating': [
    V('d_gr', 'период решётки', 'grating period'),
    V('k_or', 'порядок спектра', 'spectral order'),
    V('lam_w', 'длина волны', 'wavelength'),
    V('phi_gr', 'угол дифракции', 'diffraction angle'),
  ],
  'double-slit-fringe': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('L_sc', 'расстояние до экрана', 'screen distance'),
    V('d_sl', 'расстояние между щелями', 'slit separation'),
    V('fr_w', 'ширина полосы', 'fringe width'),
  ],
  'interference-max': [
    V('k_or', 'порядок', 'order'),
    V('lam_w', 'длина волны', 'wavelength'),
    V('delta_max', 'разность хода максимума', 'maximum path difference'),
    V('delta_min', 'разность хода минимума', 'minimum path difference'),
  ],
  'malus-law': [
    V('I0', 'начальная интенсивность', 'initial intensity'),
    V('alpha', 'угол', 'angle'),
    V('I_ml', 'интенсивность', 'intensity'),
  ],
  'brewster-angle': [
    V('n1', 'показатель преломления 1', 'refractive index 1'),
    V('n2', 'показатель преломления 2', 'refractive index 2'),
    V('theta_b', 'угол Брюстера', 'Brewster angle'),
  ],
  'photon-energy': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('E_ph', 'энергия фотона', 'photon energy'),
  ],
  'photon-momentum': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('p_ph', 'импульс фотона', 'photon momentum'),
  ],
  'photon-in-ev': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('E_ph', 'энергия фотона', 'photon energy'),
    V('E_ev', 'энергия в эВ', 'energy in eV'),
  ],
  'illuminance': [
    V('I_lm', 'сила света', 'luminous intensity'),
    V('d_m', 'расстояние', 'distance'),
    V('E_lx', 'освещённость', 'illuminance'),
  ],
  'magnifier': [
    V('d0', 'расстояние наилучшего зрения', 'near point distance'),
    V('F_len', 'фокусное расстояние', 'focal length'),
    V('Gamma_m', 'увеличение лупы', 'magnifier magnification'),
  ],
  'telescope': [
    V('F1', 'фокус объектива', 'objective focal length'),
    V('F2', 'фокус окуляра', 'eyepiece focal length'),
    V('Gamma_t', 'увеличение телескопа', 'telescope magnification'),
  ],
  'rayleigh': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('D_ap', 'диаметр апертуры', 'aperture diameter'),
    V('theta_r', 'угловое разрешение', 'angular resolution'),
  ],
  'wien-law': [
    V('T_k', 'температура', 'temperature'),
    V('b_w', 'постоянная Вина', 'Wien constant'),
    V('lam_max', 'максимум излучения', 'peak wavelength'),
  ],
  'stefan-boltzmann': [
    V('T_k', 'температура', 'temperature'),
    V('E_sb', 'энергетическая светимость', 'radiant exitance'),
  ],
  'light-travel': [
    V('L_m', 'расстояние', 'distance'),
    V('t_lt', 'время пролёта', 'travel time'),
  ],
  'redshift-v': [
    V('lam_0', 'лабораторная длина волны', 'lab wavelength'),
    V('dlam', 'сдвиг', 'shift'),
    V('z_rs', 'красное смещение', 'redshift'),
    V('v_rs', 'скорость удаления', 'recession velocity'),
  ],
  // ================= КВАНТОВАЯ И РЕЛЯТИВИСТСКАЯ ФИЗИКА =================
  'mass-energy': [
    V('m_kg', 'масса', 'mass'),
    V('E_mc', 'энергия', 'energy'),
  ],
  'gamma-factor': [
    V('v_vel', 'скорость', 'velocity'),
    V('beta_r', 'скорость относительно c', 'velocity relative to c'),
    V('gamma_r', 'лоренц-фактор', 'Lorentz factor'),
  ],
  'time-dilation': [
    V('dt0', 'собственное время', 'proper time'),
    V('beta_r', 'скорость относительно c', 'velocity relative to c'),
    V('dt_mv', 'время в движении', 'moving time'),
  ],
  'length-contraction': [
    V('L0', 'собственная длина', 'proper length'),
    V('beta_r', 'скорость относительно c', 'velocity relative to c'),
    V('L_mv', 'сокращённая длина', 'contracted length'),
  ],
  'rel-mass': [
    V('m0', 'масса покоя', 'rest mass'),
    V('beta_r', 'скорость относительно c', 'velocity relative to c'),
    V('m_rel', 'релятивистская масса', 'relativistic mass'),
  ],
  'rel-energy': [
    V('m0', 'масса покоя', 'rest mass'),
    V('gamma_r', 'лоренц-фактор', 'Lorentz factor'),
    V('E_rel', 'полная энергия', 'total energy'),
  ],
  'rel-kinetic': [
    V('m0', 'масса покоя', 'rest mass'),
    V('gamma_r', 'лоренц-фактор', 'Lorentz factor'),
    V('Ek_rel', 'кинетическая энергия', 'kinetic energy'),
  ],
  'rel-momentum': [
    V('m0', 'масса покоя', 'rest mass'),
    V('gamma_r', 'лоренц-фактор', 'Lorentz factor'),
    V('v_vel', 'скорость', 'velocity'),
    V('p_rel', 'импульс', 'momentum'),
  ],
  'velocity-addition': [
    V('up', 'скорость в штрих-системе', 'velocity in primed frame'),
    V('v_vel', 'скорость системы', 'frame velocity'),
    V('u_sum', 'суммарная скорость', 'combined velocity'),
  ],
  'rel-doppler': [
    V('lam_0', 'исходная длина волны', 'original wavelength'),
    V('beta_r', 'скорость относительно c', 'velocity relative to c'),
    V('lam_rd', 'смещённая длина волны', 'shifted wavelength'),
  ],
  'planck-energy': [
    V('nu_fr', 'частота', 'frequency'),
    V('E_q', 'энергия кванта', 'quantum energy'),
  ],
  'photoeffect': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('A_wf', 'работа выхода', 'work function'),
    V('K_max', 'максимальная кинетическая энергия', 'maximum kinetic energy'),
  ],
  'red-boundary': [
    V('A_wf', 'работа выхода', 'work function'),
    V('lam_rb', 'красная граница', 'threshold wavelength'),
  ],
  'de-broglie': [
    V('m_kg', 'масса', 'mass'),
    V('v_vel', 'скорость', 'velocity'),
    V('lam_db', 'волна де Бройля', 'de Broglie wavelength'),
  ],
  'compton-shift': [
    V('m_kg', 'масса', 'mass'),
    V('theta', 'угол рассеяния', 'scattering angle'),
    V('dlam_c', 'комптоновский сдвиг', 'Compton shift'),
  ],
  'bohr-energy': [
    V('n_q', 'главное квантовое число', 'principal quantum number'),
    V('E_bohr', 'энергия уровня', 'level energy'),
  ],
  'bohr-radius': [
    V('n_q', 'главное квантовое число', 'principal quantum number'),
    V('r1', 'радиус Бора', 'Bohr radius'),
    V('r_n', 'радиус орбиты', 'orbit radius'),
  ],
  'decay-law': [
    V('N0', 'начальное число ядер', 'initial nuclei'),
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('t_s', 'время', 'time'),
    V('N_left', 'оставшиеся ядра', 'remaining nuclei'),
  ],
  'half-life-lambda': [
    V('T_half', 'период полураспада', 'half-life'),
    V('lam_d', 'постоянная распада', 'decay constant'),
  ],
  'activity': [
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('N_at', 'число ядер', 'number of nuclei'),
    V('A_act', 'активность', 'activity'),
  ],
  'binding-energy': [
    V('dm_kg', 'дефект масс', 'mass defect'),
    V('E_bind', 'энергия связи', 'binding energy'),
  ],
  'uncertainty': [
    V('dx_m', 'неопределённость координаты', 'position uncertainty'),
    V('dp_m', 'неопределённость импульса', 'momentum uncertainty'),
  ],
  // ================= МАТЕМАТИКА · АЛГЕБРА =================
  'quadratic-discriminant': [
    V('a_q', 'старший коэффициент', 'leading coefficient'),
    V('b_q', 'средний коэффициент', 'middle coefficient'),
    V('c_q', 'свободный член', 'constant term'),
    V('D_q', 'дискриминант', 'discriminant'),
  ],
  'quadratic-roots': [
    V('a_q', 'старший коэффициент', 'leading coefficient'),
    V('b_q', 'средний коэффициент', 'middle coefficient'),
    V('c_q', 'свободный член', 'constant term'),
    V('D_q', 'дискриминант', 'discriminant'),
    V('x1', 'корень 1', 'root 1'),
    V('x2', 'корень 2', 'root 2'),
  ],
  'vieta': [
    V('a_q', 'старший коэффициент', 'leading coefficient'),
    V('b_q', 'средний коэффициент', 'middle coefficient'),
    V('c_q', 'свободный член', 'constant term'),
    V('s_v', 'сумма корней', 'sum of roots'),
    V('p_v', 'произведение корней', 'product of roots'),
  ],
  'arith-prog-nth': [
    V('a1', 'первый член', 'first term'),
    V('d_df', 'разность', 'common difference'),
    V('n_n', 'номер', 'number'),
    V('a_n', 'n-й член', 'nth term'),
  ],
  'arith-prog-sum': [
    V('a1', 'первый член', 'first term'),
    V('d_df', 'разность', 'common difference'),
    V('n_n', 'число членов', 'number of terms'),
    V('S_ar', 'сумма', 'sum'),
  ],
  'geom-prog-nth': [
    V('b1', 'первый член', 'first term'),
    V('q_g', 'знаменатель', 'common ratio'),
    V('n_n', 'номер', 'number'),
    V('b_n', 'n-й член', 'nth term'),
  ],
  'geom-prog-sum': [
    V('b1', 'первый член', 'first term'),
    V('q_g', 'знаменатель', 'common ratio'),
    V('n_n', 'число членов', 'number of terms'),
    V('S_geo', 'сумма', 'sum'),
  ],
  'geom-inf-sum': [
    V('b1', 'первый член', 'first term'),
    V('q_g', 'знаменатель', 'common ratio'),
    V('S_inf', 'сумма бесконечной', 'sum of infinite series'),
  ],
  'det-2x2': [
    V('A_m', 'матрица', 'matrix'),
  ],
  'inv-check': [
    V('A_m', 'матрица', 'matrix'),
    V('B_m', 'обратная матрица', 'inverse matrix'),
  ],
  'transpose-m': [
    V('A_m', 'матрица', 'matrix'),
  ],
  'lsolve-sys': [
    V('A_m', 'матрица системы', 'system matrix'),
    V('b_v', 'вектор правой части', 'right-hand side vector'),
  ],
  'eigen-vals': [
    V('A_m', 'матрица', 'matrix'),
  ],
  'vec-norm': [
    V('v_v', 'вектор', 'vector'),
  ],
  'complex-abs': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  'complex-re-im': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  // ================= МАТЕМАТИКА · ТРИГОНОМЕТРИЯ =================
  'deg-to-rad': [
    V('deg', 'градусы', 'degrees'),
    V('rad', 'радианы', 'radians'),
  ],
  'pythagorean-identity': [
    V('alpha', 'угол', 'angle'),
    V('chk', 'проверка (равна 1)', 'check (equals 1)'),
  ],
  'tan-def': [
    V('alpha', 'угол', 'angle'),
    V('t_chk', 'тангенс', 'tangent'),
  ],
  'sin-double': [
    V('alpha', 'угол', 'angle'),
    V('s2', 'синус двойного угла', 'double-angle sine'),
  ],
  'cos-double': [
    V('alpha', 'угол', 'angle'),
    V('c2', 'косинус двойного угла', 'double-angle cosine'),
  ],
  'sin-sum': [
    V('alpha', 'угол', 'angle'),
    V('beta_a', 'второй угол', 'second angle'),
    V('ss', 'синус суммы', 'sine of sum'),
  ],
  'cos-diff': [
    V('alpha', 'угол', 'angle'),
    V('beta_a', 'второй угол', 'second angle'),
    V('cd', 'косинус разности', 'cosine of difference'),
  ],
  'half-angle': [
    V('alpha', 'угол', 'angle'),
    V('half', 'значение sin²(α/2)', 'value of sin²(α/2)'),
  ],
  'sin-triple': [
    V('alpha', 'угол', 'angle'),
    V('s3', 'синус тройного угла', 'triple-angle sine'),
  ],
  'law-of-sines': [
    V('a_s', 'сторона a', 'side a'),
    V('A_ang', 'угол A', 'angle A'),
    V('B_ang', 'угол B', 'angle B'),
    V('b_s', 'сторона b', 'side b'),
  ],
  'law-of-cosines': [
    V('a_s', 'сторона a', 'side a'),
    V('b_s', 'сторона b', 'side b'),
    V('C_ang', 'угол C', 'angle C'),
    V('c_s', 'сторона c', 'side c'),
  ],
  'triangle-area-sin': [
    V('a_s', 'сторона a', 'side a'),
    V('b_s', 'сторона b', 'side b'),
    V('C_ang', 'угол C', 'angle C'),
    V('S_tr', 'площадь', 'area'),
  ],
  'pythagoras': [
    V('a_s', 'катет a', 'leg a'),
    V('b_s', 'катет b', 'leg b'),
    V('c_hyp', 'гипотенуза', 'hypotenuse'),
  ],
  'angle-from-sides': [
    V('a_s', 'катет a', 'leg a'),
    V('b_s', 'катет b', 'leg b'),
    V('alpha', 'угол', 'angle'),
  ],
  'sin-period': [
    V('x_v', 'аргумент', 'argument'),
  ],
  'sum-to-product': [
    V('alpha', 'угол', 'angle'),
    V('beta_a', 'второй угол', 'second angle'),
    V('sp', 'сумма через произведение', 'sum via product'),
  ],
  'sec-csc-cot': [
    V('alpha', 'угол', 'angle'),
    V('sec_a', 'секанс', 'secant'),
    V('csc_a', 'косеканс', 'cosecant'),
    V('cot_a', 'котангенс', 'cotangent'),
  ],
  // ================= ВЕРОЯТНОСТЬ =================
  'classical-prob': [
    V('m_f', 'благоприятные исходы', 'favourable outcomes'),
    V('n_t', 'всего исходов', 'total outcomes'),
    V('P_cl', 'вероятность', 'probability'),
  ],
  'complement-prob': [
    V('P_a', 'вероятность события', 'event probability'),
    V('P_not', 'вероятность противоположного', 'complementary probability'),
  ],
  'union-independent': [
    V('P_a', 'вероятность A', 'probability of A'),
    V('P_b', 'вероятность B', 'probability of B'),
    V('P_un', 'вероятность объединения', 'union probability'),
  ],
  'intersection-independent': [
    V('P_a', 'вероятность A', 'probability of A'),
    V('P_b', 'вероятность B', 'probability of B'),
    V('P_both', 'вероятность обоих', 'probability of both'),
  ],
  'conditional-prob': [
    V('P_ab', 'вероятность пересечения', 'intersection probability'),
    V('P_a', 'вероятность условия', 'condition probability'),
    V('P_cond', 'условная вероятность', 'conditional probability'),
  ],
  'bayes-theorem': [
    V('P_eh', 'правдоподобие', 'likelihood'),
    V('P_h', 'априорная вероятность', 'prior probability'),
    V('P_e', 'полная вероятность', 'total probability'),
    V('P_he', 'апостериорная вероятность', 'posterior probability'),
  ],
  'total-probability': [
    V('P_h1', 'вероятность гипотезы 1', 'hypothesis 1 probability'),
    V('P_eh1', 'правдоподобие 1', 'likelihood 1'),
    V('P_h2', 'вероятность гипотезы 2', 'hypothesis 2 probability'),
    V('P_eh2', 'правдоподобие 2', 'likelihood 2'),
    V('P_tot', 'полная вероятность', 'total probability'),
  ],
  'binomial-moments': [
    V('n_n', 'число испытаний', 'number of trials'),
    V('p_p', 'вероятность успеха', 'success probability'),
    V('mu_bn', 'среднее', 'mean'),
    V('var_bn', 'дисперсия', 'variance'),
  ],
  'geometric-mean': [
    V('p_p', 'вероятность успеха', 'success probability'),
    V('E_geo', 'среднее число попыток', 'mean number of trials'),
  ],
  'discrete-variance': [
    V('E_x', 'матожидание', 'expected value'),
    V('E_x2', 'матожидание квадрата', 'expected square'),
    V('D_x', 'дисперсия', 'variance'),
  ],
  'three-sigma': [
    V('p_3s', 'вероятность в пределах 3σ', 'probability within 3σ'),
  ],
  'z-score': [
    V('x_v', 'значение', 'value'),
    V('mu_v', 'среднее', 'mean'),
    V('sig_v', 'стандартное отклонение', 'standard deviation'),
    V('z_sc', 'z-оценка', 'z-score'),
  ],
  'erf-normal': [
    V('x_v', 'значение', 'value'),
    V('Phi_e', 'значение функции распределения', 'cdf value'),
  ],
  'dice-seven': [
    V('P_7', 'вероятность', 'probability'),
  ],
  'at-least-one': [
    V('p_p', 'вероятность успеха', 'success probability'),
    V('n_n', 'число попыток', 'number of trials'),
    V('P_one', 'вероятность хотя бы одного', 'probability of at least one'),
  ],
  // ================= СТАТИСТИКА ДАННЫХ =================
  'sample-data': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-mean': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-median': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-std': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-variance': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-range': [
    V('data', 'выборка', 'sample'),
    V('R_rg', 'размах', 'range'),
  ],
  'stat-sum-prod': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-quartiles': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-iqr': [
    V('data', 'выборка', 'sample'),
    V('IQR', 'межквартильный размах', 'interquartile range'),
  ],
  'stat-zscore': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-rms': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-cv': [
    V('data', 'выборка', 'sample'),
    V('CV', 'коэффициент вариации', 'coefficient of variation'),
  ],
  'stat-sem': [
    V('data', 'выборка', 'sample'),
    V('SE_m', 'ошибка среднего', 'standard error'),
  ],
  'stat-ci95': [
    V('data', 'выборка', 'sample'),
    V('SE_m', 'ошибка среднего', 'standard error'),
    V('half_ci', 'полуширина интервала', 'half-width of interval'),
  ],
  'stat-linfit': [
    V('X_m', 'матрица плана', 'design matrix'),
    V('y_v', 'отклики', 'responses'),
  ],
  'stat-corr': [
    V('x_v', 'выборка x', 'sample x'),
    V('y_v', 'выборка y', 'sample y'),
    V('b_sl', 'коэффициенты регрессии', 'regression coefficients'),
    V('r_xy', 'корреляция', 'correlation'),
  ],
  'stat-hist': [
    V('data', 'выборка', 'sample'),
  ],
  'stat-weighted-mean': [
    V('x_v', 'значения', 'values'),
    V('w_v', 'веса', 'weights'),
    V('wm', 'взвешенное среднее', 'weighted mean'),
  ],
  'stat-trapz-mean': [
    V('y_v', 'значения', 'values'),
    V('area', 'площадь под кривой', 'area under curve'),
    V('mean_tr', 'среднее через трапеции', 'trapezoid mean'),
  ],
  'stat-minmax-norm': [
    V('data', 'выборка', 'sample'),
    V('lo', 'минимум', 'minimum'),
    V('hi', 'максимум', 'maximum'),
    V('mid_n', 'нормированное значение', 'normalized value'),
  ],
  // ================= ДОБРАНО АУДИТОМ =================
  'escape-v2': [
    V('M_p', 'масса планеты', 'planet mass'),
    V('r_or', 'радиус планеты', 'planet radius'),
    V('v2', 'вторая космическая скорость', 'escape velocity'),
  ],
  'internal-energy-ideal': [
    V('n_mol', 'количество вещества', 'amount of substance'),
    V('T_k', 'температура', 'temperature'),
    V('U_in', 'внутренняя энергия', 'internal energy'),
  ],
  'charge-energy': [
    V('q_mv', 'переносимый заряд', 'moved charge'),
    V('U_v', 'напряжение', 'voltage'),
    V('W_q', 'энергия заряда', 'charge energy'),
  ],
  'ohm-full': [
    V('E_emf', 'ЭДС', 'EMF'),
    V('R_ld', 'внешнее сопротивление', 'external resistance'),
    V('r_in', 'внутреннее сопротивление', 'internal resistance'),
    V('I_full', 'ток', 'current'),
  ],
  'power-ac': [
    V('U_v', 'напряжение', 'voltage'),
    V('I_c', 'ток', 'current'),
    V('phi_ac', 'сдвиг фаз', 'phase shift'),
    V('P_ac', 'активная мощность', 'active power'),
  ],
  'flux-linkage': [
    V('N_tr', 'число витков', 'number of turns'),
    V('B_f', 'магнитная индукция', 'magnetic induction'),
    V('S_ar', 'площадь', 'area'),
    V('Psi_fl', 'потокосцепление', 'flux linkage'),
  ],
  'wave-eq': [
    V('A_m', 'амплитуда', 'amplitude'),
    V('w_0', 'циклическая частота', 'angular frequency'),
    V('k_wn', 'волновое число', 'wavenumber'),
    V('t_s', 'время', 'time'),
    V('x_p', 'координата', 'coordinate'),
    V('y_wv', 'смещение', 'displacement'),
  ],
  'light-in-medium': [
    V('n_md', 'показатель преломления', 'refractive index'),
    V('v_lt', 'скорость света в среде', 'speed of light in medium'),
  ],
  'compton-wavelength': [
    V('m_kg', 'масса', 'mass'),
    V('lam_c', 'комптоновская длина волны', 'Compton wavelength'),
  ],
  'uniform-moments': [
    V('a_u', 'нижняя граница', 'lower bound'),
    V('b_u', 'верхняя граница', 'upper bound'),
    V('mu_un', 'среднее', 'mean'),
    V('var_un', 'дисперсия', 'variance'),
  ],
  'stat-mode': [
    V('data', 'выборка', 'sample'),
  ],
  // ================= ПОПРАВКИ НА РЕАЛЬНЫЕ СВОЙСТВА =================
  'power-force': [
    V('F_app', 'сила', 'force'),
    V('v_vel', 'скорость', 'velocity'),
    V('P_fv', 'мощность', 'power'),
  ],
  'mech-efficiency': [
    V('A_use', 'полезная работа', 'useful work'),
    V('A_sp', 'затраченная работа', 'expended work'),
    V('eta_m', 'КПД', 'efficiency'),
  ],
  'static-friction-limit': [
    V('m_kg', 'масса', 'mass'),
    V('mu_s', 'коэффициент покоя', 'static coefficient'),
    V('F_max', 'максимальная сила покоя', 'max static friction'),
  ],
  'van-der-waals': [
    V('n_mol', 'количество вещества', 'amount of substance'),
    V('T_k', 'температура', 'temperature'),
    V('V_v', 'объём', 'volume'),
    V('a_vdw', 'притяжение молекул', 'molecular attraction'),
    V('b_vdw', 'собственный объём молекул', 'molecular volume'),
    V('P_vdw', 'давление реального газа', 'real gas pressure'),
  ],
  'ac-rms': [
    V('U_max', 'амплитудное напряжение', 'peak voltage'),
    V('U_rms', 'действующее напряжение', 'rms voltage'),
  ],
  'damped-period': [
    V('w_0', 'собственная частота', 'natural frequency'),
    V('beta_d', 'коэффициент затухания', 'damping coefficient'),
    V('T_dmp', 'период затухающих колебаний', 'damped period'),
  ],
  'cauchy-dispersion': [
    V('A_c', 'коэффициент A', 'coefficient A'),
    V('B_c', 'коэффициент B', 'coefficient B'),
    V('lam_um', 'длина волны, мкм', 'wavelength, μm'),
    V('n_cy', 'показатель преломления', 'refractive index'),
  ],
};
