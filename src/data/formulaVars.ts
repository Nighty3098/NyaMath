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
  'rot-inertia-point': [
    V('m_kg', 'масса', 'mass'),
    V('r_rad', 'радиус', 'radius'),
    V('I_pt', 'момент инерции', 'moment of inertia'),
  ],
  'rot-energy': [
    V('I_ax', 'момент инерции', 'moment of inertia'),
    V('w_ang', 'угловая скорость', 'angular velocity'),
    V('E_rot', 'энергия вращения', 'rotational energy'),
  ],
  'center-mass-2': [
    V('m1', 'масса 1', 'mass 1'),
    V('x1', 'координата 1', 'coordinate 1'),
    V('m2', 'масса 2', 'mass 2'),
    V('x2', 'координата 2', 'coordinate 2'),
    V('x_cm', 'центр масс', 'center of mass'),
  ],
  'elevator-weight': [
    V('m_kg', 'масса', 'mass'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('a_el', 'ускорение лифта', 'elevator acceleration'),
    V('P_up', 'вес вверх', 'weight going up'),
    V('P_dn', 'вес вниз', 'weight going down'),
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
  'newton-rings': [
    V('m_or', 'порядок', 'order'),
    V('lam_w', 'длина волны', 'wavelength'),
    V('R_l', 'радиус линзы', 'lens radius'),
    V('r_nr', 'радиус кольца', 'ring radius'),
  ],
  'thin-film-coating': [
    V('lam_w', 'длина волны', 'wavelength'),
    V('n_f', 'показатель плёнки', 'film index'),
    V('d_f', 'толщина плёнки', 'film thickness'),
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
  'cramer-2x2': [
    V('A_m', 'матрица системы', 'system matrix'),
    V('D_c', 'определитель системы', 'system determinant'),
    V('x_c', 'корень x', 'root x'),
    V('y_c', 'корень y', 'root y'),
  ],
  'matmul-demo': [
    V('A_m', 'матрица A', 'matrix A'),
    V('B_m', 'матрица B', 'matrix B'),
  ],
  'matpow-fib': [
    V('F_m', 'матрица Фибоначчи', 'Fibonacci matrix'),
  ],
  'trace-add': [
    V('A_m', 'матрица A', 'matrix A'),
    V('B_m', 'матрица B', 'matrix B'),
  ],
  'det-product-check': [
    V('A_m', 'матрица A', 'matrix A'),
    V('B_m', 'матрица B', 'matrix B'),
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
  // ================= ЭМ ПОЛЯ И ВОЛНЫ =================
  'em-wave-speed': [
    V('v_em', 'скорость ЭМВ', 'EM wave speed'),
  ],
  'em-wavelength': [
    V('f_hz', 'частота', 'frequency'),
    V('lam_rf', 'длина волны', 'wavelength'),
  ],
  'em-vac-impedance': [
    V('Z0', 'волновое сопротивление вакуума', 'vacuum impedance'),
  ],
  'skin-depth-cu': [
    V('f_hz', 'частота', 'frequency'),
    V('sig_cu', 'проводимость меди', 'copper conductivity'),
    V('delta_s', 'глубина скин-слоя', 'skin depth'),
  ],
  'displacement-current': [
    V('f_hz', 'частота', 'frequency'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('E_m', 'амплитуда поля', 'field amplitude'),
    V('J_d', 'плотность тока смещения', 'displacement current density'),
  ],
  'poynting-flux': [
    V('E_f', 'напряжённость E', 'electric field'),
    V('H_f', 'напряжённость H', 'magnetic field'),
    V('S_p', 'плотность потока мощности', 'power flux density'),
  ],
  'em-energy-density': [
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('E_f', 'напряжённость E', 'electric field'),
    V('mu_r', 'магнитная проницаемость', 'permeability'),
    V('H_f', 'напряжённость H', 'magnetic field'),
    V('w_em', 'плотность энергии', 'energy density'),
  ],
  'charge-relaxation': [
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('sig_m', 'проводимость', 'conductivity'),
    V('tau_r', 'время релаксации', 'relaxation time'),
  ],
  'dielectric-criterion': [
    V('sig_m', 'проводимость', 'conductivity'),
    V('f_hz', 'частота', 'frequency'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('crit', 'критерий σ/(ωε)', 'criterion σ/(ωε)'),
  ],
  'waveguide-cutoff': [
    V('a_wg', 'ширина волновода', 'waveguide width'),
    V('f_c', 'частота отсечки', 'cutoff frequency'),
  ],
  'guide-wavelength': [
    V('f_hz', 'частота', 'frequency'),
    V('a_wg', 'ширина волновода', 'waveguide width'),
    V('lam_0', 'длина волны в вакууме', 'vacuum wavelength'),
    V('f_c', 'частота отсечки', 'cutoff frequency'),
    V('lam_g', 'длина волны в волноводе', 'guide wavelength'),
  ],
  'coax-impedance': [
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('d_in', 'диаметр жилы', 'inner diameter'),
    V('D_out', 'диаметр оплётки', 'outer diameter'),
    V('Z_coax', 'импеданс', 'impedance'),
  ],
  'reflection-coeff': [
    V('Z_L', 'сопротивление нагрузки', 'load impedance'),
    V('Z_0', 'волновое сопротивление', 'line impedance'),
    V('Gamma_r', 'коэффициент отражения', 'reflection coefficient'),
  ],
  'vswr-calc': [
    V('Gamma_r', 'коэффициент отражения', 'reflection coefficient'),
    V('SWR', 'КСВН', 'VSWR'),
  ],
  'refl-power': [
    V('Gamma_r', 'коэффициент отражения', 'reflection coefficient'),
    V('P_refl', 'доля отражённой мощности', 'reflected power share'),
  ],
  'friis-link': [
    V('P_t', 'мощность передатчика', 'transmitter power'),
    V('G_t', 'усиление передачи', 'transmit gain'),
    V('G_r', 'усиление приёма', 'receive gain'),
    V('f_hz', 'частота', 'frequency'),
    V('d_m', 'дальность', 'distance'),
    V('lam_rf', 'длина волны', 'wavelength'),
    V('P_r', 'мощность на приёмнике', 'received power'),
  ],
  'cable-atten': [
    V('alpha_db', 'погонное затухание', 'loss per meter'),
    V('len_m', 'длина', 'length'),
    V('A_db', 'затухание, дБ', 'attenuation, dB'),
    V('P_ratio', 'доля мощности на выходе', 'output power share'),
  ],
  'phase-shift-line': [
    V('f_hz', 'частота', 'frequency'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('len_m', 'длина', 'length'),
    V('beta_w', 'фазовая постоянная', 'phase constant'),
    V('phi_deg', 'набег фазы, градусы', 'phase shift, degrees'),
  ],
  'energy-balance-em': [
    V('P_st', 'мощность источника', 'source power'),
    V('P_ls', 'потери', 'losses'),
    V('P_stored', 'запасённая мощность', 'stored power'),
    V('P_tr', 'излучённая мощность', 'radiated power'),
  ],
  'complex-poynting': [
    V('E_m', 'амплитуда E', 'E amplitude'),
    V('H_m', 'амплитуда H', 'H amplitude'),
    V('P_avg', 'средний поток', 'average flux'),
  ],
  'field-decay-skin': [
    V('E0', 'поле на поверхности', 'surface field'),
    V('delta_s', 'глубина скин-слоя', 'skin depth'),
    V('x_p', 'глубина', 'depth'),
    V('E_px', 'поле на глубине', 'field at depth'),
  ],
  'propagation-const': [
    V('f_hz', 'частота', 'frequency'),
    V('eps_r', 'диэлектрическая проницаемость', 'permittivity'),
    V('beta_w', 'фазовая постоянная', 'phase constant'),
  ],
  // ================= ПОЛУПРОВОДНИКИ =================
  'drift-velocity': [
    V('mu_n', 'подвижность', 'mobility'),
    V('E_f', 'напряжённость', 'field strength'),
    V('V_dr', 'дрейфовая скорость', 'drift velocity'),
  ],
  'mobility-def': [
    V('V_dr', 'дрейфовая скорость', 'drift velocity'),
    V('E_f', 'напряжённость', 'field strength'),
    V('mu_n', 'подвижность', 'mobility'),
  ],
  'conductivity-n': [
    V('n_cn', 'концентрация электронов', 'electron concentration'),
    V('mu_n', 'подвижность', 'mobility'),
    V('sig_n', 'проводимость', 'conductivity'),
  ],
  'resistivity-semi': [
    V('sig_n', 'проводимость', 'conductivity'),
    V('rho_n', 'удельное сопротивление', 'resistivity'),
  ],
  'mass-action': [
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
    V('n_cn', 'концентрация электронов', 'electron concentration'),
    V('p_cn', 'концентрация дырок', 'hole concentration'),
  ],
  'intrinsic-ni': [
    V('N_c', 'плотность состояний зоны проводимости', 'conduction band states'),
    V('N_v', 'плотность состояний валентной зоны', 'valence band states'),
    V('E_g', 'ширина запрещённой зоны', 'band gap'),
    V('T_k', 'температура', 'temperature'),
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
  ],
  'fermi-midgap': [
    V('E_g', 'ширина запрещённой зоны', 'band gap'),
    V('phi_F', 'уровень Ферми', 'Fermi level'),
  ],
  'fermi-n-shift': [
    V('N_d', 'концентрация доноров', 'donor concentration'),
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
    V('phi_T', 'тепловой потенциал', 'thermal voltage'),
    V('dphi_F', 'сдвиг Ферми', 'Fermi shift'),
  ],
  'minority-carriers': [
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
    V('N_d', 'легирование', 'doping'),
    V('p_min', 'неосновные носители', 'minority carriers'),
  ],
  'carrier-lifetime': [
    V('r_rc', 'коэффициент рекомбинации', 'recombination coefficient'),
    V('p_cn', 'концентрация дырок', 'hole concentration'),
    V('tau_n', 'время жизни', 'lifetime'),
  ],
  'recomb-rate': [
    V('r_rc', 'коэффициент рекомбинации', 'recombination coefficient'),
    V('n_cn', 'концентрация электронов', 'electron concentration'),
    V('p_cn', 'концентрация дырок', 'hole concentration'),
    V('R_rc', 'скорость рекомбинации', 'recombination rate'),
  ],
  'diffusion-length': [
    V('D_n', 'коэффициент диффузии', 'diffusion coefficient'),
    V('tau_n', 'время жизни', 'lifetime'),
    V('L_n', 'диффузионная длина', 'diffusion length'),
  ],
  'einstein-relation': [
    V('mu_n', 'подвижность', 'mobility'),
    V('phi_T', 'тепловой потенциал', 'thermal voltage'),
    V('D_n', 'коэффициент диффузии', 'diffusion coefficient'),
  ],
  'diffusion-profile': [
    V('dn0', 'избыток у поверхности', 'surface excess'),
    V('L_n', 'диффузионная длина', 'diffusion length'),
    V('x_p', 'координата', 'coordinate'),
    V('dn_x', 'избыток в точке', 'excess at point'),
  ],
  'thermal-voltage': [
    V('T_k', 'температура', 'temperature'),
    V('phi_T', 'тепловой потенциал', 'thermal voltage'),
  ],
  'conductivity-total': [
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
    V('mu_n', 'подвижность электронов', 'electron mobility'),
    V('mu_p', 'подвижность дырок', 'hole mobility'),
    V('sig_t', 'полная проводимость', 'total conductivity'),
  ],
  'bandgap-cutoff': [
    V('E_g', 'ширина запрещённой зоны, эВ', 'band gap, eV'),
    V('lam_c', 'край поглощения', 'absorption edge'),
  ],
  'drift-current': [
    V('sig_n', 'проводимость', 'conductivity'),
    V('E_f', 'напряжённость', 'field strength'),
    V('j_dr', 'плотность тока', 'current density'),
  ],
  'semi-resistor': [
    V('rho_n', 'удельное сопротивление', 'resistivity'),
    V('len_w', 'длина', 'length'),
    V('S_w', 'сечение', 'cross-section'),
    V('R_sm', 'сопротивление образца', 'sample resistance'),
  ],
  'neutrality-check': [
    V('p_cn', 'дырки', 'holes'),
    V('n_cn', 'электроны', 'electrons'),
    V('N_d', 'доноры', 'donors'),
    V('N_a', 'акцепторы', 'acceptors'),
    V('bal', 'баланс (должен быть 0)', 'balance (must be 0)'),
  ],
  'diode-iv': [
    V('I_s', 'ток насыщения', 'saturation current'),
    V('U_d', 'напряжение', 'voltage'),
    V('phi_T', 'тепловой потенциал', 'thermal voltage'),
    V('I_d', 'ток диода', 'diode current'),
  ],
  'builtin-potential': [
    V('N_a', 'концентрация акцепторов', 'acceptor concentration'),
    V('N_d', 'концентрация доноров', 'donor concentration'),
    V('n_i', 'собственная концентрация', 'intrinsic concentration'),
    V('phi_T', 'тепловой потенциал', 'thermal voltage'),
    V('V0', 'контактная разность', 'built-in potential'),
  ],
  // ================= ТЕЛЕКОМ И СЕТИ =================
  'hosts-count': [
    V('n_h', 'хостовые биты', 'host bits'),
    V('N_hosts', 'число хостов', 'host count'),
  ],
  'subnets-count': [
    V('m_bits', 'заимствованные биты', 'borrowed bits'),
    V('S_sub', 'число подсетей', 'subnet count'),
  ],
  'broadcast-offset': [
    V('net_oct', 'октет сети', 'network octet'),
    V('n_h', 'хостовые биты', 'host bits'),
    V('bc_oct', 'октет broadcast', 'broadcast octet'),
  ],
  'prefix-hostbits': [
    V('prefix', 'длина префикса', 'prefix length'),
    V('n_h', 'хостовые биты', 'host bits'),
  ],
  'mask-octet': [
    V('k_bits', 'биты маски в октете', 'mask bits in octet'),
    V('m_oct', 'октет маски', 'mask octet'),
  ],
  'wildcard-octet': [
    V('m_oct', 'октет маски', 'mask octet'),
    V('w_oct', 'октет wildcard', 'wildcard octet'),
  ],
  'class-c-hosts': [
    V('N_c', 'хосты класса C', 'class C hosts'),
  ],
  'class-b-hosts': [
    V('N_b', 'хосты класса B', 'class B hosts'),
  ],
  'class-a-hosts': [
    V('N_a', 'хосты класса A', 'class A hosts'),
  ],
  'db-ratio': [
    V('P1', 'мощность 1', 'power 1'),
    V('P2', 'мощность 2', 'power 2'),
    V('L_db', 'отношение, дБ', 'ratio, dB'),
  ],
  'dbm-power': [
    V('P_w', 'мощность, Вт', 'power, W'),
    V('P_dbm', 'мощность, дБм', 'power, dBm'),
  ],
  'watts-from-dbm': [
    V('P_dbm', 'мощность, дБм', 'power, dBm'),
    V('P_w', 'мощность, Вт', 'power, W'),
  ],
  'shannon-capacity': [
    V('B_hz', 'полоса', 'bandwidth'),
    V('snr_db', 'отношение сигнал/шум, дБ', 'SNR, dB'),
    V('C_sh', 'пропускная способность', 'capacity'),
  ],
  'fspl-loss': [
    V('d_m', 'дальность', 'distance'),
    V('f_hz', 'частота', 'frequency'),
    V('L_fs', 'потери, дБ', 'loss, dB'),
  ],
  'refl-power-t': [
    V('Gamma_r', 'коэффициент отражения', 'reflection coefficient'),
    V('P_refl', 'отражённая доля', 'reflected share'),
    V('P_trans', 'прошедшая доля', 'transmitted share'),
  ],
  's-param-db': [
    V('S_mag', 'модуль S', 'S magnitude'),
    V('S_db', 'значение, дБ', 'value, dB'),
  ],
  'quarter-antenna': [
    V('f_hz', 'частота', 'frequency'),
    V('l_ant', 'длина штыря', 'antenna length'),
  ],
  'nyquist-rate': [
    V('B_hz', 'полоса', 'bandwidth'),
    V('M_lvl', 'число уровней', 'level count'),
    V('R_ny', 'скорость', 'rate'),
  ],
  'thermal-noise-v': [
    V('T_k', 'температура', 'temperature'),
    V('R_r', 'сопротивление', 'resistance'),
    V('B_hz', 'полоса', 'bandwidth'),
    V('V_n', 'напряжение шума', 'noise voltage'),
  ],
  'adc-snr': [
    V('N_bits', 'разрядность', 'bit depth'),
    V('SNR_adc', 'отношение сигнал/шум, дБ', 'SNR, dB'),
  ],
  'link-margin': [
    V('P_rx', 'принятая мощность, дБм', 'received power, dBm'),
    V('P_min', 'чувствительность, дБм', 'sensitivity, dBm'),
    V('M_link', 'запас, дБ', 'margin, dB'),
  ],
  'bytes-fmt': [
    V('R_bit', 'скорость, бит/с', 'rate, bit/s'),
    V('R_byte', 'скорость, байт/с', 'rate, byte/s'),
  ],
  // ================= ЛОГИКА И БИТЫ =================
  'and-gate': [
    V('X1', 'вход 1', 'input 1'),
    V('X2', 'вход 2', 'input 2'),
    V('Y_and', 'выход И', 'AND output'),
  ],
  'or-gate': [
    V('X1', 'вход 1', 'input 1'),
    V('X2', 'вход 2', 'input 2'),
    V('Y_or', 'выход ИЛИ', 'OR output'),
  ],
  'xor-gate': [
    V('X1', 'вход 1', 'input 1'),
    V('X2', 'вход 2', 'input 2'),
    V('Y_xor', 'выход XOR', 'XOR output'),
  ],
  'nand-gate': [
    V('X1', 'вход 1', 'input 1'),
    V('X2', 'вход 2', 'input 2'),
    V('Y_nand', 'выход И-НЕ', 'NAND output'),
  ],
  'nor-gate': [
    V('X1', 'вход 1', 'input 1'),
    V('X2', 'вход 2', 'input 2'),
    V('Y_nor', 'выход ИЛИ-НЕ', 'NOR output'),
  ],
  'and-truth-table': [
    V('and_t', 'таблица И', 'AND table'),
  ],
  'or-truth-table': [
    V('or_t', 'таблица ИЛИ', 'OR table'),
  ],
  'xor-truth-table': [
    V('xor_t', 'таблица XOR', 'XOR table'),
  ],
  'demorgan-and': [
    V('a_b', 'бит A', 'bit A'),
    V('b_b', 'бит B', 'bit B'),
    V('lhs', 'левая часть', 'left side'),
    V('rhs', 'правая часть', 'right side'),
  ],
  'demorgan-or': [
    V('a_b', 'бит A', 'bit A'),
    V('b_b', 'бит B', 'bit B'),
    V('lhs', 'левая часть', 'left side'),
    V('rhs', 'правая часть', 'right side'),
  ],
  'double-negation': [
    V('a_b', 'бит A', 'bit A'),
    V('dneg', 'двойное отрицание', 'double negation'),
  ],
  'absorption-law': [
    V('a_b', 'бит A', 'bit A'),
    V('b_b', 'бит B', 'bit B'),
    V('absorb', 'результат', 'result'),
  ],
  'majority-vote': [
    V('a_b', 'бит A', 'bit A'),
    V('b_b', 'бит B', 'bit B'),
    V('c_b', 'бит C', 'bit C'),
    V('maj', 'большинство', 'majority'),
  ],
  'mux-2to1': [
    V('S_sw', 'селектор', 'selector'),
    V('A_in', 'вход A', 'input A'),
    V('B_in', 'вход B', 'input B'),
    V('Y_mux', 'выход', 'output'),
  ],
  // ================= ЯДЕРНАЯ ФИЗИКА =================
  'nucleus-radius': [
    V('A_n', 'массовое число', 'mass number'),
    V('R0', 'константа', 'constant'),
    V('R_n', 'радиус ядра', 'nucleus radius'),
  ],
  'mass-defect': [
    V('Z_p', 'число протонов', 'proton count'),
    V('N_n', 'число нейтронов', 'neutron count'),
    V('m_p', 'масса протона, а.е.м.', 'proton mass, u'),
    V('m_n', 'масса нейтрона, а.е.м.', 'neutron mass, u'),
    V('M_He', 'масса ядра, а.е.м.', 'nucleus mass, u'),
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
  ],
  'binding-per-nucleon': [
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('A_n', 'массовое число', 'mass number'),
    V('eps_b', 'удельная связь, МэВ', 'binding per nucleon, MeV'),
  ],
  'remaining-fraction': [
    V('k_hl', 'число периодов', 'half-life count'),
    V('f_left', 'остаток', 'remainder'),
  ],
  'mean-lifetime': [
    V('T_half', 'период полураспада', 'half-life'),
    V('tau_m', 'среднее время жизни', 'mean lifetime'),
  ],
  'detector-counts': [
    V('A_act', 'активность, Бк', 'activity, Bq'),
    V('t_s', 'время', 'time'),
    V('eta_d', 'эффективность', 'efficiency'),
    V('C_cnt', 'отсчёты', 'counts'),
  ],
  'alpha-q-u238': [
    V('M_U', 'масса U, а.е.м.', 'U mass, u'),
    V('M_Th', 'масса Th, а.е.м.', 'Th mass, u'),
    V('M_He', 'масса He, а.е.м.', 'He mass, u'),
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('Q_al', 'энергия α, МэВ', 'alpha energy, MeV'),
  ],
  'fusion-dt': [
    V('M_D', 'масса D, а.е.м.', 'D mass, u'),
    V('M_T', 'масса T, а.е.м.', 'T mass, u'),
    V('M_He', 'масса He, а.е.м.', 'He mass, u'),
    V('M_n', 'масса нейтрона, а.е.м.', 'neutron mass, u'),
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('Q_dt', 'выход, МэВ', 'yield, MeV'),
  ],
  'fission-energy': [
    V('E_mev', 'энергия, МэВ', 'energy, MeV'),
    V('E_j', 'энергия, Дж', 'energy, J'),
  ],
  'half-thickness': [
    V('mu_at', 'коэффициент ослабления', 'attenuation coefficient'),
    V('x_half', 'слой половинного ослабления', 'half-value layer'),
  ],
  'gamma-attenuation': [
    V('I0', 'начальная интенсивность', 'initial intensity'),
    V('mu_at', 'коэффициент ослабления', 'attenuation coefficient'),
    V('x_m', 'толщина', 'thickness'),
    V('I_x', 'интенсивность', 'intensity'),
  ],
  'k-ar-age': [
    V('D_ar', 'аргон', 'argon'),
    V('P_k', 'калий', 'potassium'),
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('t_age', 'возраст', 'age'),
  ],
  'u-to-mev': [
    V('m_u', 'масса, а.е.м.', 'mass, u'),
    V('E_mev', 'энергия, МэВ', 'energy, MeV'),
  ],
  'tritium-beta-q': [
    V('M_H3', 'масса трития, а.е.м.', 'tritium mass, u'),
    V('M_He3', 'масса He-3, а.е.м.', 'He-3 mass, u'),
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('Q_b', 'энергия, кэВ', 'energy, keV'),
  ],
  'pu238-power': [
    V('m_g', 'масса, г', 'mass, g'),
    V('M_mol', 'молярная масса', 'molar mass'),
    V('N_at', 'число ядер', 'number of nuclei'),
    V('T_half', 'период полураспада, с', 'half-life, s'),
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('E_al', 'энергия α, Дж', 'alpha energy, J'),
    V('P_pu', 'тепловая мощность', 'thermal power'),
  ],
  'c14-age': [
    V('f_c', 'доля C-14', 'C-14 fraction'),
    V('T_half', 'период полураспада', 'half-life'),
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('t_age', 'возраст', 'age'),
  ],
  'he4-binding': [
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('E_he', 'энергия связи, МэВ', 'binding energy, MeV'),
  ],
  'pp-chain-q': [
    V('M_H', 'масса H, а.е.м.', 'H mass, u'),
    V('M_He', 'масса He, а.е.м.', 'He mass, u'),
    V('dm_u', 'дефект масс, а.е.м.', 'mass defect, u'),
    V('Q_pp', 'выход, МэВ', 'yield, MeV'),
  ],
  'neutron-activation': [
    V('N_at', 'число ядер', 'number of nuclei'),
    V('sig_b', 'сечение, м²', 'cross-section, m²'),
    V('phi_n', 'поток нейтронов', 'neutron flux'),
    V('lam_d', 'постоянная распада', 'decay constant'),
    V('t_s', 'время', 'time'),
    V('A_nv', 'наведённая активность', 'induced activity'),
  ],
  'fission-power-rate': [
    V('R_fs', 'делений в секунду', 'fissions per second'),
    V('E_j', 'энергия деления, Дж', 'fission energy, J'),
    V('P_fs', 'мощность', 'power'),
  ],
  // ================= МАТЕМАТИКА · КОМПЛЕКСНЫЕ =================
  'complex-add': [
    V('z1', 'число 1', 'number 1'),
    V('z2', 'число 2', 'number 2'),
    V('z_sum', 'сумма', 'sum'),
  ],
  'complex-mul': [
    V('z1', 'число 1', 'number 1'),
    V('z2', 'число 2', 'number 2'),
    V('z_mul', 'произведение', 'product'),
  ],
  'complex-conj': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  'complex-div': [
    V('z_q', 'частное', 'quotient'),
  ],
  'complex-arg': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  'complex-polar-form': [
    V('z_c', 'комплексное число', 'complex number'),
    V('phi', 'аргумент', 'argument'),
    V('z_rec', 'восстановленное число', 'recovered number'),
  ],
  'demoivre-check': [
    V('z_c', 'комплексное число', 'complex number'),
    V('w1', 'степень напрямую', 'direct power'),
    V('phi', 'аргумент', 'argument'),
    V('w2', 'степень по Муавру', 'De Moivre power'),
  ],
  'mod-mult-check': [
    V('z1', 'число 1', 'number 1'),
    V('z2', 'число 2', 'number 2'),
  ],
  'mandelbrot-iter': [
    V('c_m', 'параметр', 'parameter'),
    V('z1', 'итерация 1', 'iteration 1'),
    V('z2', 'итерация 2', 'iteration 2'),
    V('z3', 'итерация 3', 'iteration 3'),
  ],
  'complex-plane-dist': [
    V('z1', 'точка 1', 'point 1'),
    V('z2', 'точка 2', 'point 2'),
    V('d_pl', 'расстояние', 'distance'),
  ],
  'rotation-j': [
    V('z_c', 'число', 'number'),
    V('z_r', 'повёрнутое число', 'rotated number'),
  ],
  're-additive': [
    V('z1', 'число 1', 'number 1'),
    V('z2', 'число 2', 'number 2'),
  ],
  'modulus-squared': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  'triangle-inequality': [
    V('z1', 'число 1', 'number 1'),
    V('z2', 'число 2', 'number 2'),
  ],
  'complex-inverse': [
    V('z_c', 'комплексное число', 'complex number'),
  ],
  // ================= МАТЕМАТИКА · РЯДЫ =================
  'sum-first-n': [
    V('n_n', 'число членов', 'number of terms'),
    V('S_f', 'сумма', 'sum'),
  ],
  'sum-squares': [
    V('n_n', 'число членов', 'number of terms'),
    V('S_sq', 'сумма квадратов', 'sum of squares'),
  ],
  'sum-cubes': [
    V('n_n', 'число членов', 'number of terms'),
    V('S_cb', 'сумма кубов', 'sum of cubes'),
  ],
  'geom-partial': [
    V('q_g', 'знаменатель', 'common ratio'),
    V('n_n', 'число членов', 'number of terms'),
    V('S_gp', 'частичная сумма', 'partial sum'),
  ],
  'harmonic-partial': [
    V('n_n', 'число членов', 'number of terms'),
    V('H_ap', 'приближение', 'approximation'),
  ],
  'ratio-test': [
    V('n_n', 'номер', 'number'),
    V('L_rt', 'предел отношения', 'ratio limit'),
  ],
  'root-test': [
    V('n_n', 'номер', 'number'),
    V('L_crt', 'предел корня', 'root limit'),
  ],
  'leibniz-bound': [
    V('n_n', 'номер', 'number'),
    V('R_bd', 'граница остатка', 'remainder bound'),
  ],
  'taylor-remainder': [
    V('M_c', 'максимум производной', 'derivative maximum'),
    V('x_p', 'точка', 'point'),
    V('n_n', 'степень', 'degree'),
    V('R_t', 'остаток', 'remainder'),
  ],
  'binomial-approx': [
    V('x_p', 'малый прирост', 'small increment'),
    V('a_p', 'показатель', 'exponent'),
  ],
  'fourier-b1-line': [
    V('b1', 'коэффициент b₁', 'coefficient b₁'),
  ],
  'fourier-square-3': [
    V('x_p', 'точка', 'point'),
    V('S3', 'сумма 3 гармоник', '3-harmonic sum'),
  ],
  'telescoping-sum': [
    V('n_n', 'число членов', 'number of terms'),
  ],
  'fourier-a1-x2': [
    V('a1', 'коэффициент a₁', 'coefficient a₁'),
  ],
  // ================= МАТЕМАТИКА · ДУ =================
  'ode-first-order-check': [
    V('lhs', 'левая часть в точке', 'left side at point'),
  ],
  'ode-equilibrium': [
    V('P_c', 'коэффициент', 'coefficient'),
    V('y_ss', 'стационар', 'steady state'),
  ],
  'newton-cooling': [
    V('T_s', 'температура среды', 'ambient temperature'),
    V('T0', 'начальная температура', 'initial temperature'),
    V('k_c', 'коэффициент теплоотдачи', 'heat transfer coefficient'),
    V('t_s', 'время', 'time'),
    V('T_t', 'температура', 'temperature'),
  ],
  'logistic-growth': [
    V('K_cp', 'ёмкость среды', 'carrying capacity'),
    V('A_l', 'константа', 'constant'),
    V('r_g', 'скорость роста', 'growth rate'),
    V('t_s', 'время', 'time'),
    V('P_l', 'популяция', 'population'),
  ],
  'harmonic-analytic': [
    V('A_m', 'амплитуда', 'amplitude'),
    V('w_0', 'частота', 'frequency'),
    V('t_s', 'время', 'time'),
    V('x_an', 'смещение', 'displacement'),
  ],
  'complex-roots-sol': [
    V('C1', 'константа 1', 'constant 1'),
    V('C2', 'константа 2', 'constant 2'),
    V('alpha', 'затухание', 'damping'),
    V('beta', 'частота', 'frequency'),
    V('x_p', 'точка', 'point'),
    V('y_cr', 'решение', 'solution'),
  ],
  'euler-step': [
    V('y0', 'старт', 'start'),
    V('h_st', 'шаг', 'step'),
    V('f_xy', 'правая часть', 'right side'),
    V('y1', 'следующая точка', 'next point'),
  ],
  'exp-growth-check': [
    V('dif', 'невязка (должна быть 0)', 'residual (must be 0)'),
  ],
  'rc-ode-sol': [
    V('Q0', 'начальный заряд', 'initial charge'),
    V('R_r', 'сопротивление', 'resistance'),
    V('C_c', 'ёмкость', 'capacitance'),
    V('t_s', 'время', 'time'),
    V('q_t', 'заряд', 'charge'),
  ],
  'rl-current': [
    V('E_emf', 'ЭДС', 'EMF'),
    V('R_r', 'сопротивление', 'resistance'),
    V('L_in', 'индуктивность', 'inductance'),
    V('t_s', 'время', 'time'),
    V('I_rl', 'ток', 'current'),
  ],
  'small-angle-error': [
    V('theta', 'угол', 'angle'),
    V('rel', 'относительная ошибка', 'relative error'),
  ],
  'superposition-beats': [
    V('t_s', 'время', 'time'),
    V('S_sp', 'сумма', 'sum'),
  ],
  'sine-ode-check': [
    V('dif', 'невязка (должна быть 0)', 'residual (must be 0)'),
  ],
  'repeated-root-sol': [
    V('C1', 'константа 1', 'constant 1'),
    V('C2', 'константа 2', 'constant 2'),
    V('lam', 'корень', 'root'),
    V('x_p', 'точка', 'point'),
    V('y_rr', 'решение', 'solution'),
  ],
  'terminal-velocity': [
    V('m_kg', 'масса', 'mass'),
    V('g_g', 'ускорение свободного падения', 'free-fall acceleration'),
    V('k_dr', 'сопротивление среды', 'drag coefficient'),
    V('v_term', 'установившаяся скорость', 'terminal velocity'),
  ],
  'direction-field-slope': [
    V('x_p', 'координата x', 'x coordinate'),
    V('y_p', 'координата y', 'y coordinate'),
    V('slope', 'наклон', 'slope'),
  ],
  // ================= ДОБРАНО ИЗ КОНСПЕКТОВ 9-UNIVERSITY =================
  'em-boundary-dn': [
    V('D1n', 'нормальная D в среде 1', 'normal D in medium 1'),
    V('D2n', 'нормальная D в среде 2', 'normal D in medium 2'),
    V('rho_s', 'поверхностный заряд', 'surface charge'),
  ],
  'em-boundary-ht': [
    V('H1t', 'касательная H в среде 1', 'tangential H in medium 1'),
    V('H2t', 'касательная H в среде 2', 'tangential H in medium 2'),
    V('Js', 'поверхностный ток', 'surface current'),
  ],
  'em-continuity': [
    V('Q0', 'начальный заряд', 'initial charge'),
    V('Q1', 'конечный заряд', 'final charge'),
    V('dt_t', 'время', 'time'),
    V('I_cc', 'ток утечки', 'leakage current'),
  ],
  'maxwell-circ': [
    V('I_cond', 'ток проводимости', 'conduction current'),
    V('I_disp', 'ток смещения', 'displacement current'),
    V('L_cont', 'длина контура', 'contour length'),
    V('H_circ', 'напряжённость H', 'magnetic field strength'),
  ],
  'thevenin-r': [
    V('Uxx', 'напряжение холостого хода', 'open-circuit voltage'),
    V('Ikz', 'ток короткого замыкания', 'short-circuit current'),
    V('R_th', 'сопротивление генератора', 'Thevenin resistance'),
  ],
  'delta-star': [
    V('R12', 'сопротивление 12', 'resistance 12'),
    V('R23', 'сопротивление 23', 'resistance 23'),
    V('R31', 'сопротивление 31', 'resistance 31'),
    V('R1', 'луч звезды 1', 'star arm 1'),
  ],
  'barometric-height': [
    V('p0', 'давление у земли', 'sea-level pressure'),
    V('M_mol', 'молярная масса воздуха', 'molar mass of air'),
    V('h_m', 'высота', 'height'),
    V('T_k', 'температура', 'temperature'),
    V('p_h', 'давление на высоте', 'pressure at height'),
  ],
  'mean-free-path': [
    V('d_mol', 'диаметр молекулы', 'molecule diameter'),
    V('n_m3', 'концентрация', 'number density'),
    V('l_mfp', 'длина пробега', 'mean free path'),
  ],
  'tangent-line': [
    V('a_pt', 'точка касания', 'tangent point'),
    V('f_a', 'значение функции', 'function value'),
    V('df_a', 'производная в точке', 'derivative at point'),
    V('x_p', 'точка оценки', 'evaluation point'),
    V('y_tan', 'значение касательной', 'tangent value'),
  ],
  'triangle-area-heron': [
    V('a_h', 'сторона a', 'side a'),
    V('b_h', 'сторона b', 'side b'),
    V('c_h', 'сторона c', 'side c'),
    V('p_h', 'полупериметр', 'semiperimeter'),
    V('S_hr', 'площадь', 'area'),
  ],
  'fresnel-zone': [
    V('m_z', 'номер зоны', 'zone number'),
    V('lam_w', 'длина волны', 'wavelength'),
    V('a_z', 'расстояние источник–экран', 'source to screen distance'),
    V('b_z', 'расстояние экран–точка', 'screen to point distance'),
    V('r_fr', 'радиус зоны', 'zone radius'),
  ],
  'xray-cutoff': [
    V('U_v', 'напряжение трубки', 'tube voltage'),
    V('lam_min', 'коротковолновая граница', 'short-wave limit'),
  ],
  'particle-box': [
    V('n_q', 'квантовое число', 'quantum number'),
    V('l_box', 'ширина ямы', 'box width'),
    V('m_kg', 'масса частицы', 'particle mass'),
    V('E_box', 'энергия уровня', 'level energy'),
  ],
  'chmod-mode': [
    V('Ur', 'владелец r', 'owner r'),
    V('Uw', 'владелец w', 'owner w'),
    V('Ux', 'владелец x', 'owner x'),
    V('Gr', 'группа r', 'group r'),
    V('Gw', 'группа w', 'group w'),
    V('Gx', 'группа x', 'group x'),
    V('Or', 'остальные r', 'other r'),
    V('Ow', 'остальные w', 'other w'),
    V('Ox', 'остальные x', 'other x'),
    V('U_d', 'цифра владельца', 'owner digit'),
    V('G_d', 'цифра группы', 'group digit'),
    V('O_d', 'цифра остальных', 'other digit'),
    V('Mode', 'режим', 'mode'),
  ],
};
