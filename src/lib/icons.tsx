import {
  // 收入类
  Wallet,
  Briefcase,
  Gift,
  PiggyBank,
  Banknote,
  Coins,
  TrendingUp,
  Award,
  Percent,
  HandCoins,
  Landmark,
  CircleDollarSign,
  // 餐饮 / 食物
  Utensils,
  Coffee,
  Apple,
  IceCreamBowl,
  Croissant,
  Wine,
  Cake,
  Pizza,
  // 出行 / 交通
  Car,
  Bus,
  Train,
  Bike,
  Plane,
  Ship,
  CarTaxiFront,
  Fuel,
  // 购物 / 服饰
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Gem,
  Store,
  Tag,
  Package,
  // 居家 / 生活
  Home,
  Lightbulb,
  Sofa,
  Wifi,
  Droplets,
  Flame,
  // 娱乐 / 兴趣
  Gamepad2,
  Film,
  Music,
  Ticket,
  Camera,
  Popcorn,
  Trophy,
  // 医疗 / 健康
  HeartPulse,
  Stethoscope,
  Pill,
  Dumbbell,
  // 教育 / 学习
  GraduationCap,
  Book,
  Pencil,
  Library,
  // 旅行 / 住宿
  Bed,
  Luggage,
  MapPin,
  Tent,
  // 家庭 / 情感
  Baby,
  PawPrint,
  Heart,
  Users,
  // 其他
  Cigarette,
  type LucideIcon,
} from 'lucide-react';

/**
 * 图标名（kebab-case，与后端返回的 icon 字段一致） -> lucide-react 组件
 *
 * 选型原则：
 * 1. 围绕"记账 / 消费 / 货币"主题，避免风格混杂；
 * 2. 全部使用 lucide-react 实心线条图标，stroke-width 默认 2，视觉一致；
 * 3. 覆盖记账场景中常见的收入来源、消费类别、支付渠道；
 * 4. 名称稳定，作为后端 API 的 icon 字段契约。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  // 收入
  wallet: Wallet,
  briefcase: Briefcase,
  gift: Gift,
  'piggy-bank': PiggyBank,
  banknote: Banknote,
  coins: Coins,
  'trending-up': TrendingUp,
  award: Award,
  percent: Percent,
  'hand-coins': HandCoins,
  landmark: Landmark,
  'circle-dollar-sign': CircleDollarSign,
  // 餐饮
  utensils: Utensils,
  coffee: Coffee,
  apple: Apple,
  'ice-cream-bowl': IceCreamBowl,
  croissant: Croissant,
  wine: Wine,
  cake: Cake,
  pizza: Pizza,
  // 出行
  car: Car,
  'car-taxi-front': CarTaxiFront,
  bus: Bus,
  train: Train,
  bike: Bike,
  plane: Plane,
  ship: Ship,
  fuel: Fuel,
  // 购物
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  shirt: Shirt,
  gem: Gem,
  store: Store,
  tag: Tag,
  package: Package,
  // 居家
  home: Home,
  lightbulb: Lightbulb,
  sofa: Sofa,
  wifi: Wifi,
  droplets: Droplets,
  flame: Flame,
  // 娱乐
  'gamepad-2': Gamepad2,
  film: Film,
  music: Music,
  ticket: Ticket,
  camera: Camera,
  popcorn: Popcorn,
  trophy: Trophy,
  // 医疗 / 健康
  'heart-pulse': HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  dumbbell: Dumbbell,
  // 教育 / 学习
  'graduation-cap': GraduationCap,
  book: Book,
  pencil: Pencil,
  library: Library,
  // 旅行 / 住宿
  bed: Bed,
  luggage: Luggage,
  'map-pin': MapPin,
  tent: Tent,
  // 家庭 / 情感
  baby: Baby,
  'paw-print': PawPrint,
  heart: Heart,
  users: Users,
  // 其他
  cigarette: Cigarette,
  // 兼容历史数据：信用卡、手机
  'credit-card': Landmark,
  smartphone: Wallet,
};

const DEFAULT_ICON = CircleDollarSign;

/** 根据图标名获取 lucide 图标组件 */
export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? DEFAULT_ICON;
}

/**
 * IconPicker 可选的图标列表（用于 Admin 页面选择）。
 * 按语义分组展示，方便用户快速定位需要的图标。
 */
export interface PickableGroup {
  /** 分组标题 */
  group: string;
  /** 该组下的图标 */
  items: { name: string; label: string }[];
}

export const PICKABLE_ICON_GROUPS: PickableGroup[] = [
  {
    group: '收入',
    items: [
      { name: 'wallet', label: '工资' },
      { name: 'briefcase', label: '兼职' },
      { name: 'gift', label: '奖金' },
      { name: 'trending-up', label: '投资' },
      { name: 'piggy-bank', label: '存钱' },
      { name: 'banknote', label: '现金' },
      { name: 'coins', label: '硬币' },
      { name: 'hand-coins', label: '收款' },
      { name: 'award', label: '奖金' },
      { name: 'percent', label: '利息' },
      { name: 'landmark', label: '银行' },
      { name: 'circle-dollar-sign', label: '美元' },
    ],
  },
  {
    group: '餐饮',
    items: [
      { name: 'utensils', label: '正餐' },
      { name: 'coffee', label: '咖啡' },
      { name: 'apple', label: '水果' },
      { name: 'cake', label: '甜品' },
      { name: 'wine', label: '酒水' },
      { name: 'pizza', label: '外卖' },
      { name: 'croissant', label: '早餐' },
      { name: 'ice-cream-bowl', label: '冷饮' },
    ],
  },
  {
    group: '交通',
    items: [
      { name: 'car', label: '汽车' },
      { name: 'car-taxi-front', label: '打车' },
      { name: 'bus', label: '公交' },
      { name: 'train', label: '高铁' },
      { name: 'bike', label: '骑行' },
      { name: 'plane', label: '机票' },
      { name: 'ship', label: '船票' },
      { name: 'fuel', label: '加油' },
    ],
  },
  {
    group: '购物',
    items: [
      { name: 'shopping-bag', label: '购物' },
      { name: 'shopping-cart', label: '超市' },
      { name: 'shirt', label: '服饰' },
      { name: 'gem', label: '美妆' },
      { name: 'store', label: '门店' },
      { name: 'tag', label: '折扣' },
      { name: 'package', label: '快递' },
    ],
  },
  {
    group: '居家',
    items: [
      { name: 'home', label: '房租' },
      { name: 'sofa', label: '家具' },
      { name: 'lightbulb', label: '电费' },
      { name: 'droplets', label: '水费' },
      { name: 'flame', label: '燃气' },
      { name: 'wifi', label: '网费' },
    ],
  },
  {
    group: '娱乐',
    items: [
      { name: 'gamepad-2', label: '游戏' },
      { name: 'film', label: '电影' },
      { name: 'music', label: '音乐' },
      { name: 'ticket', label: '演出' },
      { name: 'camera', label: '摄影' },
      { name: 'popcorn', label: '零食' },
      { name: 'trophy', label: '比赛' },
    ],
  },
  {
    group: '医疗 / 健康',
    items: [
      { name: 'heart-pulse', label: '医疗' },
      { name: 'stethoscope', label: '问诊' },
      { name: 'pill', label: '药品' },
      { name: 'dumbbell', label: '健身' },
    ],
  },
  {
    group: '教育 / 学习',
    items: [
      { name: 'graduation-cap', label: '学费' },
      { name: 'book', label: '书籍' },
      { name: 'pencil', label: '文具' },
      { name: 'library', label: '培训' },
    ],
  },
  {
    group: '旅行 / 住宿',
    items: [
      { name: 'bed', label: '酒店' },
      { name: 'luggage', label: '行李' },
      { name: 'tent', label: '露营' },
      { name: 'map-pin', label: '景点' },
    ],
  },
  {
    group: '家庭 / 情感',
    items: [
      { name: 'baby', label: '育儿' },
      { name: 'paw-print', label: '宠物' },
      { name: 'heart', label: '礼物' },
      { name: 'users', label: '聚会' },
    ],
  },
  {
    group: '其他',
    items: [
      { name: 'cigarette', label: '烟酒' },
      { name: 'circle-dollar-sign', label: '默认' },
    ],
  },
];

/** 扁平化的可挑选图标列表（向后兼容） */
export const PICKABLE_ICONS: { name: string; label: string }[] =
  PICKABLE_ICON_GROUPS.flatMap((g) => g.items);
