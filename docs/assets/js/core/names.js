/**
 * Name pools for the deterministic data engine.
 *
 * Each entry carries both an English transliteration and the Bangla spelling,
 * because §13 requires student-facing documents (report cards, admit cards,
 * certificates) to render in Bangla while admin screens stay English.
 */

export const MALE_FIRST = [
  ['Abdullah', 'আব্দুল্লাহ'], ['Rakib', 'রাকিব'], ['Tanvir', 'তানভীর'],
  ['Sakib', 'সাকিব'], ['Mehedi', 'মেহেদী'], ['Arif', 'আরিফ'],
  ['Nayeem', 'নাঈম'], ['Sabbir', 'সাব্বির'], ['Rifat', 'রিফাত'],
  ['Jahid', 'জাহিদ'], ['Shakil', 'শাকিল'], ['Fahim', 'ফাহিম'],
  ['Rasel', 'রাসেল'], ['Imran', 'ইমরান'], ['Sohel', 'সোহেল'],
  ['Anik', 'অনিক'], ['Tamim', 'তামিম'], ['Nafis', 'নাফিস'],
  ['Sajid', 'সাজিদ'], ['Rohan', 'রোহান'], ['Ashraful', 'আশরাফুল'],
  ['Mahmud', 'মাহমুদ'], ['Riyad', 'রিয়াদ'], ['Sourav', 'সৌরভ'],
  ['Ridoy', 'হৃদয়'], ['Emon', 'ইমন'], ['Jubayer', 'জুবায়ের'],
  ['Mizanur', 'মিজানুর'], ['Habib', 'হাবিব'], ['Shuvo', 'শুভ'],
  ['Prottoy', 'প্রত্যয়'], ['Adnan', 'আদনান'], ['Farhan', 'ফারহান'],
  ['Zayan', 'জায়ান'], ['Ayan', 'আয়ান'], ['Arnab', 'অর্ণব'],
];

export const FEMALE_FIRST = [
  ['Fatema', 'ফাতেমা'], ['Ayesha', 'আয়েশা'], ['Sumaiya', 'সুমাইয়া'],
  ['Nusrat', 'নুসরাত'], ['Tasnim', 'তাসনিম'], ['Jannatul', 'জান্নাতুল'],
  ['Sadia', 'সাদিয়া'], ['Mim', 'মীম'], ['Lamia', 'লামিয়া'],
  ['Israt', 'ইসরাত'], ['Farzana', 'ফারজানা'], ['Rumana', 'রুমানা'],
  ['Sharmin', 'শারমিন'], ['Tanjina', 'তানজিনা'], ['Nabila', 'নাবিলা'],
  ['Maliha', 'মালিহা'], ['Rafia', 'রাফিয়া'], ['Anika', 'আনিকা'],
  ['Prithila', 'প্রিথিলা'], ['Samiha', 'সামিহা'], ['Rubaiya', 'রুবাইয়া'],
  ['Nishat', 'নিশাত'], ['Zarin', 'জারিন'], ['Mahia', 'মাহিয়া'],
  ['Oishi', 'ঐশী'], ['Trisha', 'তৃষা'], ['Purnima', 'পূর্ণিমা'],
  ['Shreya', 'শ্রেয়া'], ['Nandini', 'নন্দিনী'], ['Aditi', 'অদিতি'],
  ['Raisa', 'রাইসা'], ['Meherun', 'মেহেরুন'], ['Sanjida', 'সানজিদা'],
];

export const SURNAMES = [
  ['Ahmed', 'আহমেদ'], ['Hossain', 'হোসেন'], ['Islam', 'ইসলাম'],
  ['Rahman', 'রহমান'], ['Chowdhury', 'চৌধুরী'], ['Khan', 'খান'],
  ['Akter', 'আক্তার'], ['Begum', 'বেগম'], ['Uddin', 'উদ্দিন'],
  ['Sarkar', 'সরকার'], ['Mia', 'মিয়া'], ['Talukder', 'তালুকদার'],
  ['Bhuiyan', 'ভূঁইয়া'], ['Molla', 'মোল্লা'], ['Sheikh', 'শেখ'],
  ['Das', 'দাস'], ['Roy', 'রায়'], ['Ghosh', 'ঘোষ'],
  ['Barua', 'বড়ুয়া'], ['Dey', 'দে'], ['Saha', 'সাহা'],
  ['Mahmud', 'মাহমুদ'], ['Alam', 'আলম'], ['Haque', 'হক'],
  ['Kabir', 'কবির'], ['Siddique', 'সিদ্দিক'], ['Rashid', 'রশিদ'],
];

/** Father-name prefixes — Bangladeshi guardian records read this way. */
export const MALE_HONORIFIC = [
  ['Md.', 'মোঃ'], ['Mohammad', 'মোহাম্মদ'], ['Abul', 'আবুল'], ['Abdul', 'আব্দুল'],
];

export const FEMALE_HONORIFIC = [
  ['Mst.', 'মোসাঃ'], ['Mrs.', 'মিসেস'], ['Most.', 'মোছাঃ'],
];

export const OCCUPATIONS = [
  'Businessman', 'Government Service', 'Private Service', 'Teacher', 'Farmer',
  'Doctor', 'Engineer', 'Bank Officer', 'Shopkeeper', 'Driver', 'Expatriate',
  'Homemaker', 'Lawyer', 'Nurse', 'Contractor', 'Tailor', 'Imam',
];

export const RELIGIONS = [
  { name: 'Islam', nameBn: 'ইসলাম', weight: 88 },
  { name: 'Hinduism', nameBn: 'হিন্দু', weight: 10 },
  { name: 'Buddhism', nameBn: 'বৌদ্ধ', weight: 1 },
  { name: 'Christianity', nameBn: 'খ্রিস্টান', weight: 1 },
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const BLOOD_WEIGHTS = [22, 3, 34, 4, 28, 3, 5, 1];

/** Sylhet-area localities — the institution's catchment (see INSTITUTION). */
export const AREAS = [
  'Zindabazar', 'Ambarkhana', 'Subid Bazar', 'Uposhohor', 'Shibganj',
  'Tilagarh', 'Mirabazar', 'Kumarpara', 'Bagbari', 'Pathantula',
  'Modina Market', 'Shahi Eidgah', 'Lamabazar', 'Chowhatta', 'Rikabibazar',
  'Kadamtali', 'South Surma', 'Bondorbazar', 'Majortila', 'Golapganj',
];

/** Staff name pool — kept separate so teachers don't collide with students. */
export const STAFF_TITLES = ['Md.', 'Prof.', 'Dr.', 'Mrs.', 'Mst.', ''];

export const DESIGNATIONS = [
  { id: 'PRIN', name: 'Principal', grade: 1, basic: 62000 },
  { id: 'VPRIN', name: 'Vice Principal', grade: 2, basic: 52000 },
  { id: 'HEADT', name: 'Head Teacher', grade: 3, basic: 45000 },
  { id: 'SRLEC', name: 'Senior Lecturer', grade: 4, basic: 38000 },
  { id: 'LEC', name: 'Lecturer', grade: 5, basic: 32000 },
  { id: 'ASTT', name: 'Assistant Teacher', grade: 6, basic: 26000 },
  { id: 'JRTCH', name: 'Junior Teacher', grade: 7, basic: 21000 },
  { id: 'ACCT', name: 'Accountant', grade: 6, basic: 25000 },
  { id: 'LIBR', name: 'Librarian', grade: 7, basic: 22000 },
  { id: 'OFFA', name: 'Office Assistant', grade: 9, basic: 15000 },
  { id: 'PEON', name: 'Peon', grade: 11, basic: 11000 },
  { id: 'DRVR', name: 'Driver', grade: 10, basic: 14000 },
  { id: 'GUARD', name: 'Security Guard', grade: 11, basic: 11500 },
];
