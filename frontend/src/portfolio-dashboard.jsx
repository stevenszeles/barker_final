import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart, Bar, Cell } from "recharts";

// ─── SEED DATA: Account ...013 balance history (May 2024 – Mar 2026) ──────────
const SEED_BALANCE_013 = [["2024-05-14",336796.23],["2024-05-15",338431.74],["2024-05-16",341946.65],["2024-05-17",340212.38],["2024-05-18",340212.38],["2024-05-19",340212.38],["2024-05-20",341036.3],["2024-05-21",340910.62],["2024-05-22",341620.03],["2024-05-23",340192.89],["2024-05-24",336561.39],["2024-05-25",336561.39],["2024-05-26",336561.39],["2024-05-27",336561.39],["2024-05-28",338394.89],["2024-05-29",337209.88],["2024-05-30",334379.67],["2024-05-31",333579.88],["2024-06-01",333579.88],["2024-06-02",333579.88],["2024-06-03",336725.03],["2024-06-04",335964.25],["2024-06-05",335755.5],["2024-06-06",339328.45],["2024-06-07",339080.66],["2024-06-08",339080.66],["2024-06-09",339080.66],["2024-06-10",338115.8],["2024-06-11",338526.13],["2024-06-12",339257.36],["2024-06-13",342526.41],["2024-06-14",343072.79],["2024-06-15",343072.79],["2024-06-16",343072.79],["2024-06-17",342703.67],["2024-06-18",345344.51],["2024-06-19",345344.51],["2024-06-20",346119.42],["2024-06-21",345551.8],["2024-06-22",345551.8],["2024-06-23",345551.8],["2024-06-24",345227.63],["2024-06-25",343981.7],["2024-06-26",344513.94],["2024-06-27",344576.64],["2024-06-28",345238.96],["2024-06-29",345238.96],["2024-06-30",345238.96],["2024-07-01",343939.67],["2024-07-02",343364.95],["2024-07-03",345412.73],["2024-07-04",345412.73],["2024-07-05",347279.17],["2024-07-06",347279.17],["2024-07-07",347279.17],["2024-07-08",348264.37],["2024-07-09",348556.14],["2024-07-10",348488.57],["2024-07-11",351915.09],["2024-07-12",350615.42],["2024-07-13",350615.42],["2024-07-14",350615.42],["2024-07-15",352243.86],["2024-07-16",353239.89],["2024-07-17",357007.41],["2024-07-18",352544.68],["2024-07-19",349816.64],["2024-07-20",349816.64],["2024-07-21",349816.64],["2024-07-22",347258.69],["2024-07-23",350531.2],["2024-07-24",349486.18],["2024-07-25",341694.4],["2024-07-26",341541.65],["2024-07-27",341541.65],["2024-07-28",341541.65],["2024-07-29",345345.94],["2024-07-30",344945.3],["2024-07-31",343864.25],["2024-08-01",348403.82],["2024-08-02",342236.3],["2024-08-03",342236.3],["2024-08-04",342236.3],["2024-08-05",335888.14],["2024-08-06",328895.94],["2024-08-07",330154.23],["2024-08-08",327486.21],["2024-08-09",333965.22],["2024-08-10",333965.22],["2024-08-11",333965.22],["2024-08-12",334904.75],["2024-08-13",334651.67],["2024-08-14",339668.8],["2024-08-15",340291.31],["2024-08-16",346321.3],["2024-08-17",346321.3],["2024-08-18",346321.3],["2024-08-19",347171.32],["2024-08-20",350642.42],["2024-08-21",349661.39],["2024-08-22",351351.36],["2024-08-23",348387.93],["2024-08-24",348387.93],["2024-08-25",348387.93],["2024-08-26",353212.82],["2024-08-27",352015.9],["2024-08-28",351838.75],["2024-08-29",349970.3],["2024-08-30",350105.04],["2024-08-31",350105.04],["2024-09-01",350105.04],["2024-09-02",350105.04],["2024-09-03",353281.52],["2024-09-04",346101.8],["2024-09-05",345997.56],["2024-09-06",344590.79],["2024-09-07",344590.79],["2024-09-08",344590.79],["2024-09-09",340351.06],["2024-09-10",343910.96],["2024-09-11",345769.0],["2024-09-12",348875.49],["2024-09-13",351137.48],["2024-09-14",351137.48],["2024-09-15",351137.48],["2024-09-16",353354.77],["2024-09-17",354631.71],["2024-09-18",354349.19],["2024-09-19",352605.02],["2024-09-20",357489.2],["2024-09-21",357489.2],["2024-09-22",357489.2],["2024-09-23",356944.55],["2024-09-24",357057.95],["2024-09-25",357948.82],["2024-09-26",357958.17],["2024-09-27",359830.16],["2024-09-28",359830.16],["2024-09-29",359830.16],["2024-09-30",359792.86],["2024-10-01",360534.07],["2024-10-02",358049.73],["2024-10-03",357937.92],["2024-10-04",356474.91],["2024-10-05",356474.91],["2024-10-06",356474.91],["2024-10-07",359116.84],["2024-10-08",356216.62],["2024-10-09",358680.94],["2024-10-10",360606.92],["2024-10-11",359762.49],["2024-10-12",359762.49],["2024-10-13",359762.49],["2024-10-14",361933.49],["2024-10-15",364238.16],["2024-10-16",362306.32],["2024-10-17",364777.8],["2024-10-18",364265.9],["2024-10-19",364265.9],["2024-10-20",364265.9],["2024-10-21",365376.52],["2024-10-22",363616.55],["2024-10-23",362703.21],["2024-10-24",360170.93],["2024-10-25",361359.15],["2024-10-26",361359.15],["2024-10-27",361359.15],["2024-10-28",360649.64],["2024-10-29",361818.95],["2024-10-30",361928.18],["2024-10-31",360671.06],["2024-11-01",355256.41],["2024-11-02",355256.41],["2024-11-03",355256.41],["2024-11-04",355974.23],["2024-11-05",355656.84],["2024-11-06",359967.71],["2024-11-07",368866.28],["2024-11-08",371464.94],["2024-11-09",371464.94],["2024-11-10",371464.94],["2024-11-11",373581.35],["2024-11-12",374334.92],["2024-11-13",372507.55],["2024-11-14",372551.76],["2024-11-15",370212.27],["2024-11-16",370212.27],["2024-11-17",370212.27],["2024-11-18",365935.78],["2024-11-19",367776.04],["2024-11-20",368780.35],["2024-11-21",368481.54],["2024-11-22",372222.79],["2024-11-23",372222.79],["2024-11-24",372222.79],["2024-11-25",374403.18],["2024-11-26",377131.62],["2024-11-27",378657.82],["2024-11-28",378657.82],["2024-11-29",377373.49],["2024-11-30",377373.49],["2024-12-01",377373.49],["2024-12-02",379547.15],["2024-12-03",379535.19],["2024-12-04",378514.93],["2024-12-05",380550.19],["2024-12-06",379689.91],["2024-12-07",379689.91],["2024-12-08",379689.91],["2024-12-09",380762.85],["2024-12-10",378095.74],["2024-12-11",376193.35],["2024-12-12",378303.38],["2024-12-13",376272.4],["2024-12-14",376272.4],["2024-12-15",376272.4],["2024-12-16",376077.96],["2024-12-17",377236.39],["2024-12-18",375866.72],["2024-12-19",364595.51],["2024-12-20",363859.06],["2024-12-21",363859.06],["2024-12-22",363859.06],["2024-12-23",367620.35],["2024-12-24",368127.36],["2024-12-25",368127.36],["2024-12-26",371778.31],["2024-12-27",373010.27],["2024-12-28",373010.27],["2024-12-29",373010.27],["2024-12-30",369372.3],["2024-12-31",365441.64],["2025-01-01",365441.64],["2025-01-02",364345.01],["2025-01-03",363726.26],["2025-01-04",363726.26],["2025-01-05",363726.26],["2025-01-06",367815.78],["2025-01-07",369010.62],["2025-01-08",365322.6],["2025-01-09",365649.22],["2025-01-10",365649.22],["2025-01-11",365649.22],["2025-01-12",365649.22],["2025-01-13",360088.02],["2025-01-14",360557.32],["2025-01-15",361601.46],["2025-01-16",367357.28],["2025-01-17",367844.39],["2025-01-18",367844.39],["2025-01-19",367844.39],["2025-01-20",367844.39],["2025-01-21",370999.03],["2025-01-22",374809.55],["2025-01-23",376223.44],["2025-01-24",378144.05],["2025-01-25",378144.05],["2025-01-26",378144.05],["2025-01-27",376815.96],["2025-01-28",369114.91],["2025-01-29",372646.97],["2025-01-30",371502.72],["2025-01-31",375307.69],["2025-02-01",375307.69],["2025-02-02",375307.69],["2025-02-03",371187.76],["2025-02-04",368763.37],["2025-02-05",371708.17],["2025-02-06",374514.87],["2025-02-07",376211.95],["2025-02-08",376211.95],["2025-02-09",376211.95],["2025-02-10",372773.86],["2025-02-11",376345.39],["2025-02-12",375958.16],["2025-02-13",373907.56],["2025-02-14",377961.21],["2025-02-15",377961.21],["2025-02-16",377961.21],["2025-02-17",377961.21],["2025-02-18",378425.74],["2025-02-19",381581.06],["2025-02-20",381948.66],["2025-02-21",379748.87],["2025-02-22",379748.87],["2025-02-23",372262.77],["2025-02-24",370136.54],["2025-02-25",368351.1],["2025-02-26",369140.72],["2025-02-27",363494.09],["2025-02-28",369214.84],["2025-03-01",369214.84],["2025-03-02",369214.84],["2025-03-03",362526.84],["2025-03-04",358421.47],["2025-03-05",362110.93],["2025-03-06",355217.11],["2025-03-07",357430.22],["2025-03-08",357430.22],["2025-03-09",357430.22],["2025-03-10",348222.04],["2025-03-11",345606.81],["2025-03-12",347514.63],["2025-03-13",342900.41],["2025-03-14",350292.4],["2025-03-15",350292.4],["2025-03-16",350292.4],["2025-03-17",353300.14],["2025-03-18",349694.5],["2025-03-19",353603.75],["2025-03-20",352783.37],["2025-03-21",352254.53],["2025-03-22",352254.53],["2025-03-23",352254.53],["2025-03-24",357223.03],["2025-03-25",357657.72],["2025-03-26",354758.76],["2025-03-27",353124.72],["2025-03-28",346380.4],["2025-03-29",346380.4],["2025-03-30",346380.4],["2025-03-31",348199.51],["2025-04-01",349623.33],["2025-04-02",352447.34],["2025-04-03",335268.99],["2025-04-04",315642.16],["2025-04-05",315642.16],["2025-04-06",315642.16],["2025-04-07",314792.71],["2025-04-08",310077.1],["2025-04-09",339375.21],["2025-04-10",326942.34],["2025-04-11",332047.49],["2025-04-12",332047.49],["2025-04-13",332047.49],["2025-04-14",334404.67],["2025-04-15",334110.56],["2025-04-16",327499.96],["2025-04-17",327931.8],["2025-04-18",327931.8],["2025-04-19",327931.8],["2025-04-20",327931.8],["2025-04-21",320300.18],["2025-04-22",328093.52],["2025-04-23",333707.92],["2025-04-24",341011.66],["2025-04-25",343409.45],["2025-04-26",343409.45],["2025-04-27",343409.45],["2025-04-28",343867.29],["2025-04-29",345905.09],["2025-04-30",345984.98],["2025-05-01",347801.88],["2025-05-02",352988.91],["2025-05-03",352988.91],["2025-05-04",352988.91],["2025-05-05",351163.15],["2025-05-06",349202.61],["2025-05-07",351455.9],["2025-05-08",353643.64],["2025-05-09",353524.32],["2025-05-10",353524.32],["2025-05-11",353524.32],["2025-05-12",364544.68],["2025-05-13",368215.79],["2025-05-14",368565.1],["2025-05-15",370295.62],["2025-05-16",372522.36],["2025-05-17",372522.36],["2025-05-18",372522.36],["2025-05-19",372549.05],["2025-05-20",371248.7],["2025-05-21",364890.09],["2025-05-22",364836.15],["2025-05-23",363675.11],["2025-05-24",363675.11],["2025-05-25",363675.11],["2025-05-26",363675.11],["2025-05-27",370992.95],["2025-05-28",369017.7],["2025-05-29",369704.23],["2025-05-30",369344.37],["2025-05-31",369344.37],["2025-06-01",369344.37],["2025-06-02",370960.24],["2025-06-03",373659.22],["2025-06-04",373620.16],["2025-06-05",371970.16],["2025-06-06",375698.54],["2025-06-07",375698.54],["2025-06-08",375698.54],["2025-06-09",376434.23],["2025-06-10",378430.29],["2025-06-11",378309.44],["2025-06-12",379560.37],["2025-06-13",375432.79],["2025-06-14",375432.79],["2025-06-15",375432.79],["2025-06-16",379725.22],["2025-06-17",376884.14],["2025-06-18",376956.92],["2025-06-19",376956.92],["2025-06-20",376195.02],["2025-06-21",376195.02],["2025-06-22",376195.02],["2025-06-23",378893.68],["2025-06-24",383646.63],["2025-06-25",384394.04],["2025-06-26",387565.65],["2025-06-27",389148.83],["2025-06-28",389148.83],["2025-06-29",389148.83],["2025-06-30",391483.46],["2025-07-01",390783.2],["2025-07-02",392804.09],["2025-07-03",395897.95],["2025-07-04",395897.95],["2025-07-05",395897.95],["2025-07-06",395897.95],["2025-07-07",392888.2],["2025-07-08",392570.74],["2025-07-09",394347.05],["2025-07-10",395232.26],["2025-07-11",393769.97],["2025-07-12",393769.97],["2025-07-13",393769.97],["2025-07-14",394944.97],["2025-07-15",393439.34],["2025-07-16",394937.13],["2025-07-17",397545.06],["2025-07-18",397712.28],["2025-07-19",397712.28],["2025-07-20",397712.28],["2025-07-21",397845.51],["2025-07-22",398003.77],["2025-07-23",401159.54],["2025-07-24",401474.39],["2025-07-25",402657.03],["2025-07-26",402657.03],["2025-07-27",402657.03],["2025-07-28",402690.6],["2025-07-29",401679.01],["2025-07-30",401168.0],["2025-07-31",399019.34],["2025-08-01",392280.6],["2025-08-02",392280.6],["2025-08-03",392280.6],["2025-08-04",398063.47],["2025-08-05",396512.53],["2025-08-06",399398.65],["2025-08-07",398933.69],["2025-08-08",401046.23],["2025-08-09",401046.23],["2025-08-10",401046.23],["2025-08-11",400032.28],["2025-08-12",404712.91],["2025-08-13",406384.59],["2025-08-14",405942.26],["2025-08-15",404310.86],["2025-08-16",404310.86],["2025-08-17",404310.86],["2025-08-18",404561.85],["2025-08-19",401585.85],["2025-08-20",400529.77],["2025-08-21",399347.11],["2025-08-22",405891.38],["2025-08-23",405891.38],["2025-08-24",405891.38],["2025-08-25",404383.25],["2025-08-26",406245.62],["2025-08-27",407121.15],["2025-08-28",408680.96],["2025-08-29",405722.61],["2025-08-30",405722.61],["2025-08-31",405722.61],["2025-09-01",405722.61],["2025-09-02",402789.12],["2025-09-03",404073.66],["2025-09-04",407318.94],["2025-09-05",406657.31],["2025-09-06",406657.31],["2025-09-07",406657.31],["2025-09-08",408156.29],["2025-09-09",409359.88],["2025-09-10",410902.74],["2025-09-11",415313.02],["2025-09-12",414604.99],["2025-09-13",414604.99],["2025-09-14",414604.99],["2025-09-15",417157.26],["2025-09-16",415740.2],["2025-09-17",415837.25],["2025-09-18",418957.57],["2025-09-19",421698.38],["2025-09-20",421698.38],["2025-09-21",421698.38],["2025-09-22",422967.35],["2025-09-23",421346.07],["2025-09-24",420469.24],["2025-09-25",418165.0],["2025-09-26",421052.0],["2025-09-27",421052.0],["2025-09-28",421052.0],["2025-09-29",423158.86],["2025-09-30",424674.68],["2025-10-01",426525.44],["2025-10-02",427119.97],["2025-10-03",427140.73],["2025-10-04",427140.73],["2025-10-05",427140.73],["2025-10-06",429655.37],["2025-10-07",428171.26],["2025-10-08",430811.65],["2025-10-09",428682.54],["2025-10-10",417486.45],["2025-10-11",417486.45],["2025-10-12",417486.45],["2025-10-13",424674.09],["2025-10-14",424898.29],["2025-10-15",427442.77],["2025-10-16",423997.76],["2025-10-17",424722.53],["2025-10-18",424722.53],["2025-10-19",424722.53],["2025-10-20",429252.28],["2025-10-21",428395.79],["2025-10-22",425382.7],["2025-10-23",427958.64],["2025-10-24",431759.44],["2025-10-25",431759.44],["2025-10-26",431759.44],["2025-10-27",436022.94],["2025-10-28",436897.36],["2025-10-29",435847.06],["2025-10-30",432676.07],["2025-10-31",434154.91],["2025-11-01",434154.91],["2025-11-02",434154.91],["2025-11-03",434607.7],["2025-11-04",429302.01],["2025-11-05",430899.22],["2025-11-06",425476.38],["2025-11-07",426391.26],["2025-11-08",426391.26],["2025-11-09",426391.26],["2025-11-10",432756.02],["2025-11-11",433393.05],["2025-11-12",433916.49],["2025-11-13",426453.74],["2025-11-14",425773.38],["2025-11-15",425773.38],["2025-11-16",425773.38],["2025-11-17",420929.86],["2025-11-18",417601.22],["2025-11-19",417880.63],["2025-11-20",410943.84],["2025-11-21",415204.1],["2025-11-22",415204.1],["2025-11-23",415204.1],["2025-11-24",420389.03],["2025-11-25",424278.95],["2025-11-26",427561.98],["2025-11-27",427561.98],["2025-11-28",430168.57],["2025-11-29",430168.57],["2025-11-30",430168.57],["2025-12-01",427556.24],["2025-12-02",428602.49],["2025-12-03",430418.82],["2025-12-04",430760.92],["2025-12-05",432191.88],["2025-12-06",432191.88],["2025-12-07",432191.88],["2025-12-08",431436.47],["2025-12-09",431180.33],["2025-12-10",434709.62],["2025-12-11",436108.29],["2025-12-12",431567.94],["2025-12-13",431567.94],["2025-12-14",431567.94],["2025-12-15",431016.71],["2025-12-16",430080.69],["2025-12-17",425399.56],["2025-12-18",428655.36],["2025-12-19",432582.21],["2025-12-20",432582.21],["2025-12-21",432582.21],["2025-12-22",434205.06],["2025-12-23",435554.1],["2025-12-24",438466.04],["2025-12-25",438466.04],["2025-12-26",438609.07],["2025-12-27",438609.07],["2025-12-28",438609.07],["2025-12-29",436781.9],["2025-12-30",436131.86],["2025-12-31",432961.36],["2026-01-01",432961.36],["2026-01-02",433819.65],["2026-01-03",433819.65],["2026-01-04",433819.65],["2026-01-05",436787.77],["2026-01-06",440782.0],["2026-01-07",438795.97],["2026-01-08",438356.0],["2026-01-09",441331.03],["2026-01-10",441331.03],["2026-01-11",441331.03],["2026-01-12",442150.72],["2026-01-13",440583.68],["2026-01-14",438746.54],["2026-01-15",440018.2],["2026-01-16",439583.21],["2026-01-17",439583.21],["2026-01-18",439583.21],["2026-01-19",439583.21],["2026-01-20",431967.72],["2026-01-21",436658.66],["2026-01-22",439367.3],["2026-01-23",439078.59],["2026-01-24",439078.59],["2026-01-25",439078.59],["2026-01-26",440753.06],["2026-01-27",441981.67],["2026-01-28",442274.84],["2026-01-29",441945.29],["2026-01-30",438390.79],["2026-01-31",438390.79],["2026-02-01",438390.79],["2026-02-02",441178.09],["2026-02-03",437663.84],["2026-02-04",434440.74],["2026-02-05",428495.54],["2026-02-06",437537.65],["2026-02-07",437537.65],["2026-02-08",437537.65],["2026-02-09",439403.36],["2026-02-10",440212.77],["2026-02-11",439734.05],["2026-02-12",433091.7],["2026-02-13",434745.31],["2026-02-14",434745.31],["2026-02-15",434745.31],["2026-02-16",434745.31],["2026-02-17",434623.85],["2026-02-18",437077.42],["2026-02-19",436228.78],["2026-02-20",438543.29],["2026-02-21",438543.29],["2026-02-22",438543.29],["2026-02-23",433525.85],["2026-02-24",437035.54],["2026-02-25",440201.26],["2026-02-26",439909.57],["2026-02-27",438900.8],["2026-02-28",438900.8],["2026-03-01",438900.8],["2026-03-02",438382.76],["2026-03-03",434254.86],["2026-03-04",438166.95],["2026-03-05",435899.92],["2026-03-06",430687.1],["2026-03-07",430687.1],["2026-03-09",430687.1]];

// ─── S&P 500 SECTOR MODEL ─────────────────────────────────────────────────────
const SP500_SECTORS = [
  { name:"Communication Services", etf:"XLC", color:"#ff6b6b" },
  { name:"Consumer Discretionary", etf:"XLY", color:"#ff9f43" },
  { name:"Consumer Staples", etf:"XLP", color:"#a3be4c" },
  { name:"Energy", etf:"XLE", color:"#ffb703" },
  { name:"Financials", etf:"XLF", color:"#7c4dff" },
  { name:"Health Care", etf:"XLV", color:"#00e676" },
  { name:"Industrials", etf:"XLI", color:"#4dd0e1" },
  { name:"Information Technology", etf:"XLK", color:"#00d4ff" },
  { name:"Materials", etf:"XLB", color:"#ffd166" },
  { name:"Real Estate", etf:"XLRE", color:"#26c6da" },
  { name:"Utilities", etf:"XLU", color:"#66bb6a" },
];

const MANUAL_ONLY_SECTORS = [
  { name:"Crypto", etf:null, color:"#ff8c42" },
  { name:"Commodities", etf:null, color:"#ffd166" },
  { name:"Equities", etf:null, color:"#8ecae6" },
];

const ALL_SECTORS = [...SP500_SECTORS, ...MANUAL_ONLY_SECTORS];

const UNCLASSIFIED_SECTOR = "Unclassified";
const SECTOR_OVERRIDE_AUTO = "__AUTO__";

const SECTOR_TO_ETF = Object.fromEntries(SP500_SECTORS.map(({ name, etf }) => [name, etf]));
const ETF_TO_SECTOR = Object.fromEntries(SP500_SECTORS.map(({ name, etf }) => [etf, name]));
const SP500_SECTOR_SET = new Set(SP500_SECTORS.map(s => s.name));
const ALL_SECTOR_SET = new Set(ALL_SECTORS.map(s => s.name));

// Editable baseline weights for the sector allocation model.
const DEFAULT_SECTOR_BENCHMARK_WEIGHTS = {
  "Communication Services": 9.0,
  "Consumer Discretionary": 10.0,
  "Consumer Staples": 5.8,
  "Energy": 3.5,
  "Financials": 14.0,
  "Health Care": 10.5,
  "Industrials": 8.5,
  "Information Technology": 31.0,
  "Materials": 2.9,
  "Real Estate": 2.3,
  "Utilities": 2.5,
  "Crypto": 0,
  "Commodities": 0,
  "Equities": 0,
};

const SYMBOL_TO_SECTOR = {
  AMZN:"Consumer Discretionary",
  BRK_B:"Financials",
  BX:"Financials",
  CG:"Financials",
  COST:"Consumer Staples",
  HWM:"Industrials",
  ISRG:"Health Care",
  JNJ:"Health Care",
  JPM:"Financials",
  LMT:"Industrials",
  NYT:"Communication Services",
  PSX:"Energy",
  REXR:"Real Estate",
  SO:"Utilities",
  SOFI:"Financials",
  WMT:"Consumer Staples",
  UGL:"Materials",
  XLB:"Materials",
  XLC:"Communication Services",
  XLE:"Energy",
  XLF:"Financials",
  XLI:"Industrials",
  XLK:"Information Technology",
  XLP:"Consumer Staples",
  XLRE:"Real Estate",
  XLU:"Utilities",
  XLV:"Health Care",
  XLY:"Consumer Discretionary",
  CCJ:"Energy",
  CVX:"Energy",
  PAA:"Energy",
  XOM:"Energy",
  PPA:"Industrials",
  LLY:"Health Care",
  RDDT:"Communication Services",
  NEM:"Materials",
  NFLX:"Communication Services",
  QQQ:"Information Technology",
  GS:"Financials",
  MS:"Financials",
  DIS:"Communication Services",
  COP:"Energy",
  MSFT:"Information Technology",
  NKE:"Consumer Discretionary",
  OKLO:"Utilities",
  NBIS:"Information Technology",
};

const SECTOR_COLORS = Object.fromEntries([
  ...ALL_SECTORS.map(({ name, color }) => [name, color]),
  [UNCLASSIFIED_SECTOR, "#666"],
]);

const ACCOUNT_COLORS = ["#00d4ff","#7c4dff","#ff6b35","#00e676","#ffd600","#e91e63","#ff9800","#4caf50","#2196f3","#ff5722","#9c27b0","#00bcd4"];
const APP_BUILD_VERSION = "2026.03.11.1";
const APP_STATE_STORAGE_KEY = `portfolio-dashboard.app-state.${APP_BUILD_VERSION}`;
const LEGACY_APP_STATE_STORAGE_KEYS = [
  "portfolio-dashboard.app-state.2026.03.10.2",
];
const MARKET_CACHE_STORAGE_KEY = "portfolio-dashboard.market-cache.v1";
const SECURITY_HISTORY_STORAGE_KEY = "portfolio-dashboard.security-history.v1";
const SHARED_DASHBOARD_STATE_ENDPOINT = "/api/admin/shared-dashboard-state";
const SHARED_DASHBOARD_POLL_MS = 60000;
const SHARED_DASHBOARD_SAVE_DEBOUNCE_MS = 900;

function loadJSONStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSONStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and serialization failures in the browser.
  }
}

function clearJSONStorage(key) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in the browser.
  }
}

function loadPersistedAppState() {
  const current = loadJSONStorage(APP_STATE_STORAGE_KEY, null);
  if (current) return current;
  for (const key of LEGACY_APP_STATE_STORAGE_KEYS) {
    const legacy = loadJSONStorage(key, null);
    if (legacy) return legacy;
  }
  return null;
}

function buildInitialSectorTargets() {
  return Object.fromEntries(
    ALL_SECTORS.map(({ name }) => [
      name,
      {
        benchmarkWeight: DEFAULT_SECTOR_BENCHMARK_WEIGHTS[name] || 0,
        targetWeight: DEFAULT_SECTOR_BENCHMARK_WEIGHTS[name] || 0,
      },
    ]),
  );
}

function normalizeSectorTargets(rawTargets) {
  const defaults = buildInitialSectorTargets();
  if (!rawTargets) return defaults;

  return Object.fromEntries(
    ALL_SECTORS.map(({ name }) => {
      const fallback = defaults[name];
      const raw = rawTargets[name] || {};
      const benchmarkWeight = Number.isFinite(raw.benchmarkWeight) ? raw.benchmarkWeight : fallback.benchmarkWeight;
      const targetWeight = Number.isFinite(raw.targetWeight)
        ? raw.targetWeight
        : benchmarkWeight + (Number.isFinite(raw.activeWeight) ? raw.activeWeight : 0);
      return [name, { benchmarkWeight, targetWeight }];
    }),
  );
}

function normalizeSectorTargetsByAccount(rawTargetsByAccount, accountNames = []) {
  const normalized = {};
  const hasPerAccountShape = rawTargetsByAccount
    && typeof rawTargetsByAccount === 'object'
    && !Array.isArray(rawTargetsByAccount)
    && Object.values(rawTargetsByAccount).some((value) => value && typeof value === 'object' && !Number.isFinite(value.benchmarkWeight));

  if (hasPerAccountShape) {
    Object.entries(rawTargetsByAccount).forEach(([scope, value]) => {
      if (!value || typeof value !== 'object') return;
      normalized[scope] = normalizeSectorTargets(value);
    });
  } else if (rawTargetsByAccount) {
    normalized.ALL = normalizeSectorTargets(rawTargetsByAccount);
  }

  accountNames.forEach((accountName) => {
    if (!normalized[accountName]) normalized[accountName] = normalizeSectorTargets(normalized.ALL || buildInitialSectorTargets());
  });

  return normalized;
}

function getSectorOverrideKey(accountName, symbol) {
  return `${accountName}::${symbol}`;
}

function getRealizedTradeOverrideKey(trade) {
  if (!trade) return null;
  const closedDate = normalizeDateInput(trade.closedDate) || String(trade.closedDate || '');
  const openedDate = normalizeDateInput(trade.openedDate) || String(trade.openedDate || '');
  return [
    'REALIZED',
    normalizeAccountName(trade.account),
    trade.symbol || '',
    closedDate,
    openedDate,
    String(trade.qty ?? ''),
    String(trade.proceeds ?? ''),
    String(trade.cost ?? ''),
  ].join('::');
}

function normalizeAccountName(value) {
  const raw = String(value || '').replace(/"/g, '').trim();
  if (!raw) return '';

  const llcMatch = raw.match(/Limit(?:_| )Liability(?:_| )Company\s+\.{3}(\d+)/i);
  if (llcMatch) return `Limit_Liability_Company ...${llcMatch[1]}`;

  const indivMatch = raw.match(/Individual\s+\.{3}(\d+)/i);
  if (indivMatch) return `Individual ...${indivMatch[1]}`;

  return raw.replace(/\s+/g, ' ');
}

function normalizePerformanceChartSelection(rawSelection, accountNames = [], fallbackShowSPX = true) {
  const rawAccounts = rawSelection?.accounts || {};
  return {
    aggregate: rawSelection?.aggregate ?? true,
    spx: rawSelection?.spx ?? fallbackShowSPX,
    accounts: Object.fromEntries(accountNames.map((name) => [name, !!rawAccounts[name]])),
  };
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSharedDashboardState(rawState) {
  const accounts = asPlainObject(rawState?.accounts);
  const balanceHistory = asPlainObject(rawState?.balanceHistory);
  const realizedTrades = Array.isArray(rawState?.realizedTrades) ? rawState.realizedTrades : [];
  const accountNames = [...new Set([...Object.keys(accounts), ...Object.keys(balanceHistory)])].filter((name) => name && name !== 'ALL');
  return {
    accounts,
    balanceHistory,
    realizedTrades,
    sectorTargetsByAccount: normalizeSectorTargetsByAccount(rawState?.sectorTargetsByAccount || rawState?.sectorTargets, accountNames),
    sectorOverrides: asPlainObject(rawState?.sectorOverrides),
  };
}

function buildSharedDashboardStatePayload(rawState) {
  const normalized = normalizeSharedDashboardState(rawState);
  return {
    accounts: normalized.accounts,
    balanceHistory: normalized.balanceHistory,
    realizedTrades: normalized.realizedTrades,
    sectorTargetsByAccount: normalized.sectorTargetsByAccount,
    sectorOverrides: normalized.sectorOverrides,
  };
}

function getSharedDashboardStateSignature(rawState) {
  try {
    return JSON.stringify(buildSharedDashboardStatePayload(rawState));
  } catch {
    return "";
  }
}

function hasSharedDashboardStateContent(rawState) {
  const normalized = normalizeSharedDashboardState(rawState);
  return Boolean(
    Object.keys(normalized.accounts).length
    || Object.keys(normalized.balanceHistory).length
    || normalized.realizedTrades.length
    || Object.keys(normalized.sectorTargetsByAccount || {}).length
    || Object.keys(normalized.sectorOverrides || {}).length
  );
}

function resolveMainSector(symbol, cleanSym, assetType = "") {
  const mapped = SYMBOL_TO_SECTOR[cleanSym] || SYMBOL_TO_SECTOR[symbol] || ETF_TO_SECTOR[cleanSym] || null;
  if (mapped && SP500_SECTOR_SET.has(mapped)) return mapped;
  if (assetType.includes("Option")) return null;
  return null;
}

// ─── CSV PARSERS ──────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = []; let current = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuote = !inQuote; }
    else if (line[i] === ',' && !inQuote) { result.push(current.trim()); current = ""; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

function parsePositionsCSV(text) {
  const lines = text.split('\n');
  const accounts = {};
  let currentAccount = null;
  let headers = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Account header
    const accMatch = line.match(/^(Limit(?:_| )Liability(?:_| )Company \.\.\.[0-9]+|Individual \.\.\.[0-9]+)/);
    if (accMatch) {
      currentAccount = normalizeAccountName(accMatch[1]);
      accounts[currentAccount] = { positions: [], total: 0, cash: 0 };
      headers = null;
      continue;
    }
    if (!currentAccount) continue;
    const parts = parseCSVLine(line);
    if (parts[0] === 'Symbol') { headers = parts; continue; }
    if (!headers) continue;
    if (parts[0].startsWith('Account Total')) {
      const val = parts[6] ? parseFloat(parts[6].replace(/[$,]/g, '')) : 0;
      const cost = parts[9] ? parseFloat(parts[9].replace(/[$,]/g, '')) : 0;
      accounts[currentAccount].total = isNaN(val) ? 0 : val;
      accounts[currentAccount].cost = isNaN(cost) ? 0 : cost;
      continue;
    }
    if (parts[0].startsWith('Cash')) {
      const cash = parts[6] ? parseFloat(parts[6].replace(/[$,]/g, '')) : 0;
      accounts[currentAccount].cash = isNaN(cash) ? 0 : cash;
      continue;
    }
    if (!parts[0]) continue;
    const rawSymbol = parts[0].replace(/"/g, '').trim();
    const qty = parseFloat(parts[2]?.replace(/,/g, '')) || 0;
    const price = parseFloat(parts[3]?.replace(/[$,]/g, '')) || 0;
    const mktVal = parseFloat(parts[6]?.replace(/[$,]/g, '')) || 0;
    const costBasis = parseFloat(parts[9]?.replace(/[$,]/g, '')) || 0;
    const gainPct = parseFloat(parts[11]?.replace(/%/g, '')) || 0;
    const assetType = parts[16] || 'Equity';
    const description = parts[1]?.replace(/"/g, '').trim() || '';
    if (rawSymbol && Math.abs(qty) > 0) {
      const isOption = assetType.includes('Option') || /\d{2}\/\d{2}\/\d{4}/.test(rawSymbol);
      const baseSymbol = (rawSymbol.match(/^[A-Z]+(?:[./-][A-Z]+)?(?:\/[A-Z]+)?/)?.[0] || rawSymbol.split(' ')[0] || rawSymbol)
        .replace(/[^A-Z0-9/._-]/g, '');
      const normalizedSymbol = rawSymbol.replace(/[^A-Z0-9/._ -]/g, '').trim();
      const sectorLookupSym = isOption ? baseSymbol : normalizedSymbol;
      const cleanSym = sectorLookupSym.replace(/[\/.\- ]/g, '_');
      const mainSector = resolveMainSector(sectorLookupSym, cleanSym, assetType);
      accounts[currentAccount].positions.push({
        account: currentAccount,
        symbol: rawSymbol,
        normalizedSymbol,
        baseSymbol,
        overrideSymbol: isOption ? baseSymbol : normalizedSymbol,
        historySymbol: isOption ? null : normalizedSymbol,
        cleanSym,
        description,
        qty,
        price,
        mktVal,
        costBasis,
        gainPct,
        assetType,
        sector: mainSector || UNCLASSIFIED_SECTOR,
        mainSector,
        isSectorETF: !isOption && mainSector ? cleanSym === SECTOR_TO_ETF[mainSector] : false,
      });
    }
  }
  return accounts;
}

function parseBalancesCSV(text, accountHint) {
  const lines = text.split('\n');
  const data = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.toLowerCase().includes('date')) continue;
    const m = t.match(/"?(\d+\/\d+\/\d+)"?,"?\$?([\d,]+\.?\d*)"?/);
    if (m) {
      const [,dateStr, amtStr] = m;
      const [mo, dy, yr] = dateStr.split('/').map(Number);
      const iso = `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
      data.push([iso, parseFloat(amtStr.replace(/,/g,''))]);
    }
  }
  data.sort((a,b) => a[0].localeCompare(b[0]));
  // Infer account from filename hint
  const acctMatch = accountHint?.match(/XXXX(\d+)/i);
  const suffix = acctMatch ? `...${acctMatch[1]}` : '...013';
  return { account: normalizeAccountName(`Limit_Liability_Company ${suffix}`), data };
}

function parseRealizedCSV(text) {
  const lines = text.split('\n');
  const trades = [];
  let currentAccount = null;
  let inData = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const accMatch = line.match(/"?(Limit(?:_| )Liability(?:_| )Company|Individual) \.\.\.[0-9]+"?/);
    if (accMatch) {
      currentAccount = normalizeAccountName(line);
      inData = false; continue;
    }
    if (line.includes('"Symbol"') && line.includes('"Closed Date"')) { inData = true; continue; }
    if (!inData || !currentAccount) continue;
    if (line.includes('no transactions')) { inData = false; continue; }
    const parts = parseCSVLine(line);
    if (parts.length < 10 || !parts[0]) continue;
    const sym = parts[0].replace(/"/g,'');
    if (!sym || sym === 'Symbol') continue;
    const closedDate = parts[2].replace(/"/g,'');
    const openedDate = parts[3].replace(/"/g,'');
    const qty = parseFloat(parts[4]) || 0;
    const proceeds = parseFloat(parts[7]?.replace(/[$,]/g,'')) || 0;
    const cost = parseFloat(parts[8]?.replace(/[$,]/g,'')) || 0;
    const gain = parseFloat(parts[9]?.replace(/[$,]/g,'')) || 0;
    const gainPct = parseFloat(parts[10]?.replace(/%/g,'')) || 0;
    const term = parts[13] || 'Short Term';
    const isOption = sym.includes(' ') || sym.match(/\d{2}\/\d{2}\/\d{4}/);
    const baseSym = sym.split(' ')[0];
    const mainSector = resolveMainSector(baseSym, baseSym, isOption ? 'Option' : '');
    trades.push({
      account: currentAccount,
      symbol: sym,
      baseSym,
      closedDate,
      openedDate,
      qty,
      proceeds,
      cost,
      gain,
      gainPct,
      term,
      isOption,
      sector: mainSector || UNCLASSIFIED_SECTOR,
      mainSector,
    });
  }
  return trades;
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────
function computeNormalizedSeries(data) {
  if (!data || data.length === 0) return [];
  const base = data[0][1];
  if (!base || base === 0) return data.map(([d]) => ({ date: d, pct: 0 }));
  return data.map(([date, val]) => ({ date, pct: ((val - base) / base) * 100, nav: val }));
}

function computeReturns(data) {
  const vals = data.map(d => d[1]);
  if (vals.length < 2) return { total: 0, ytd: 0, maxDrawdown: 0, volatility: 0, sharpe: 0, calmar: 0 };
  const first = vals[0], last = vals[vals.length - 1];
  const total = ((last - first) / first) * 100;
  // YTD: find Jan 1 of current year
  const now = new Date();
  const ytdStart = data.findIndex(([d]) => d >= `${now.getFullYear()}-01-01`);
  const ytd = ytdStart >= 0 ? ((last - vals[ytdStart]) / vals[ytdStart]) * 100 : total;
  // Max drawdown
  let peak = vals[0], maxDD = 0;
  for (const v of vals) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > maxDD) maxDD = dd; }
  // Daily returns for vol/sharpe
  const dailyRets = [];
  for (let i = 1; i < vals.length; i++) dailyRets.push((vals[i] - vals[i-1]) / vals[i-1]);
  const mean = dailyRets.reduce((a,b)=>a+b,0)/dailyRets.length;
  const variance = dailyRets.reduce((a,b)=>a+(b-mean)**2,0)/dailyRets.length;
  const vol = Math.sqrt(variance * 252) * 100;
  const annMean = mean * 252 * 100;
  const sharpe = vol > 0 ? (annMean - 4.3) / vol : 0; // ~4.3% risk free
  const calmar = maxDD > 0 ? (annMean / (maxDD * 100)) : 0;
  return { total, ytd, maxDrawdown: maxDD * 100, volatility: vol, sharpe, calmar, currentNav: last };
}

function computePeriodReturn(data) {
  if (!data || data.length < 2) return null;
  const first = data[0]?.[1];
  const last = data[data.length - 1]?.[1];
  if (!first || !last) return null;
  return ((last - first) / first) * 100;
}

function filterByTimeframe(data, tf) {
  if (!data?.length) return data;
  const last = new Date(data[data.length-1][0]);
  let cutoff;
  if (tf === '1M') cutoff = new Date(last.getTime() - 30*86400000);
  else if (tf === '3M') cutoff = new Date(last.getTime() - 90*86400000);
  else if (tf === '6M') cutoff = new Date(last.getTime() - 180*86400000);
  else if (tf === 'YTD') cutoff = new Date(`${last.getFullYear()}-01-01`);
  else if (tf === '1Y') cutoff = new Date(last.getTime() - 365*86400000);
  else if (tf === '2Y') cutoff = new Date(last.getTime() - 730*86400000);
  else return data;
  const iso = cutoff.toISOString().slice(0,10);
  return data.filter(([d]) => d >= iso);
}

function buildAggregateHistory(histories) {
  const seriesList = Object.values(histories || {}).filter(series => series?.length);
  if (!seriesList.length) return [];

  const dates = [...new Set(seriesList.flatMap(series => series.map(([date]) => date)))].sort();
  const indices = seriesList.map(() => 0);
  const lastVals = seriesList.map(() => 0);

  return dates.map((date) => {
    let total = 0;
    seriesList.forEach((series, i) => {
      while (indices[i] < series.length && series[indices[i]][0] <= date) {
        lastVals[i] = series[indices[i]][1];
        indices[i] += 1;
      }
      total += lastVals[i] || 0;
    });
    return [date, total];
  });
}

function buildNormalizedComparisonRows(seriesDefinitions) {
  const prepared = (seriesDefinitions || [])
    .map((series) => {
      const points = series?.data || [];
      const base = points[0]?.[1];
      if (!points.length || !Number.isFinite(base) || base === 0) return null;
      return { ...series, points, base };
    })
    .filter(Boolean);

  if (!prepared.length) return [];

  const dates = [...new Set(prepared.flatMap((series) => series.points.map(([date]) => date)))].sort();
  const indices = prepared.map(() => 0);
  const lastPcts = prepared.map(() => null);

  return dates.map((date) => {
    const row = { date };
    prepared.forEach((series, index) => {
      while (indices[index] < series.points.length && series.points[indices[index]][0] <= date) {
        const value = series.points[indices[index]][1];
        lastPcts[index] = ((value - series.base) / series.base) * 100;
        indices[index] += 1;
      }
      row[series.key] = lastPcts[index] === null ? null : parseFloat(lastPcts[index].toFixed(3));
    });
    return row;
  });
}

function getPerformanceSeriesKey(accountName, index) {
  return `__acct_${index}_${String(accountName || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)}`;
}

function getSectorStance(activeWeight) {
  if (activeWeight > 0.001) return 'Overweight';
  if (activeWeight < -0.001) return 'Underweight';
  return 'Equal';
}

function normalizeDateInput(value) {
  if (!value) return null;
  const trimmed = String(value).replace(/"/g, '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getFirstValueOnOrAfter(series, targetDate) {
  if (!series?.length || !targetDate) return null;
  for (const point of series) {
    if (point[0] >= targetDate) return point;
  }
  return null;
}

function getLastValueOnOrBefore(series, targetDate) {
  if (!series?.length || !targetDate) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i][0] <= targetDate) return series[i];
  }
  return null;
}

function getValueOnOrBefore(series, targetDate) {
  return getLastValueOnOrBefore(series, targetDate)?.[1] ?? null;
}

function filterTradesByDateRange(trades, startDate, endDate) {
  return trades.filter((trade) => {
    const iso = trade.closedDateISO || normalizeDateInput(trade.closedDate);
    return iso && (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
  });
}

function formatDateLocalISO(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeframeBounds(tf, anchorDateISO = formatDateLocalISO()) {
  const endDate = anchorDateISO || formatDateLocalISO();
  if (!endDate || tf === 'ALL') return { startDate: null, endDate };

  const anchor = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(anchor.getTime())) return { startDate: null, endDate };

  let startDate = null;
  if (tf === 'YTD') {
    startDate = `${anchor.getFullYear()}-01-01`;
  } else {
    const daysByTimeframe = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      '2Y': 730,
    };
    const days = daysByTimeframe[tf];
    if (days) {
      const start = new Date(anchor);
      start.setDate(start.getDate() - days);
      startDate = formatDateLocalISO(start);
    }
  }

  return { startDate, endDate };
}

function getSecurityHistoryCacheKey(symbol) {
  if (!symbol) return null;
  const normalized = String(symbol)
    .trim()
    .replace(/\^/g, '')
    .replace(/[^A-Z0-9/._-]/gi, '')
    .replace(/[\/_.]/g, '-')
    .toUpperCase();
  return normalized || null;
}

function toStooqSymbol(symbol) {
  if (symbol === "^GSPC") return "^spx";
  const normalized = getSecurityHistoryCacheKey(symbol)?.toLowerCase();
  return normalized ? `${normalized}.us` : null;
}

function parseStooqHistory(text, days = 3650) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [date, , , , close] = line.split(",");
      const value = parseFloat(close);
      if (!date || Number.isNaN(value)) return null;
      return [date, value];
    })
    .filter(Boolean)
    .filter(([date]) => date >= cutoff);
}

async function loadBenchmarkHistorySeries(symbol, { days = 3650, retries = 1 } = {}) {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) throw new Error(`No benchmark data for ${symbol}`);
  const url = `/api/stooq/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || !text.startsWith("Date,")) throw new Error(`No benchmark data for ${symbol}`);
      return parseStooqHistory(text, days);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw lastError || new Error(`No benchmark data for ${symbol}`);
}

function fmt$(n) { if (n===undefined||n===null||isNaN(n)) return '--'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n); }
function fmtPct(n,decimals=2) { if (n===undefined||n===null||isNaN(n)) return '--'; return `${n>=0?'+':''}${n.toFixed(decimals)}%`; }
function fmtNum(n,d=2) { if (n===undefined||n===null||isNaN(n)) return '--'; return n.toFixed(d); }
const CHART_TICK_STYLE = { fill:'#7f8790', fontSize:10 };

function getTickInterval(length, targetTicks = 8) {
  if (!length || length <= targetTicks) return 0;
  return Math.max(0, Math.ceil(length / targetTicks) - 1);
}

function getCategoryAxisWidth(labels, minWidth = 120, maxWidth = 220) {
  const longest = (labels || []).reduce((max, label) => Math.max(max, String(label || '').length), 0);
  return Math.min(maxWidth, Math.max(minWidth, longest * 7 + 20));
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: {
    background:'#020304',
    color:'#d8dce2',
    fontFamily:"'IBM Plex Mono', 'JetBrains Mono', 'SFMono-Regular', 'Menlo', monospace",
    minHeight:'100vh',
    fontSize:'12px',
    padding:'14px',
    backgroundImage:[
      'radial-gradient(circle at top left, rgba(255,166,52,0.08), transparent 24%)',
      'radial-gradient(circle at top right, rgba(37,117,252,0.05), transparent 28%)',
      'linear-gradient(180deg, rgba(18,22,27,0.98), rgba(2,3,4,1))',
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 28px)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 28px)',
    ].join(','),
  },
  screen: {
    maxWidth:'1680px',
    margin:'0 auto',
    background:'linear-gradient(180deg, rgba(15,18,21,0.99), rgba(4,6,8,1))',
    border:'1px solid rgba(244,178,79,0.14)',
    boxShadow:'0 18px 48px rgba(0,0,0,0.48)',
    overflow:'hidden',
  },
  headerShell: {
    background:'linear-gradient(180deg, rgba(22,25,29,0.98), rgba(8,10,12,0.98))',
    borderBottom:'1px solid rgba(244,178,79,0.1)',
  },
  header: {
    padding:'10px 18px',
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:'18px',
    borderBottom:'1px solid rgba(255,255,255,0.04)',
  },
  logo: {
    color:'#f4b24f',
    fontWeight:700,
    fontSize:'16px',
    letterSpacing:'2.8px',
    textTransform:'uppercase',
  },
  headerMeta: { color:'#8b9097', fontSize:'10px', letterSpacing:'1.5px', textTransform:'uppercase' },
  statusPill: {
    background:'linear-gradient(180deg, rgba(46,52,58,0.96), rgba(14,17,20,0.96))',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#d8dce2',
    padding:'6px 10px',
    borderRadius:'2px',
    fontSize:'10px',
    letterSpacing:'1.1px',
    textTransform:'uppercase',
    boxShadow:'none',
  },
  marketRibbon: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(132px, 1fr))',
    gap:'8px',
    padding:'10px 18px 14px',
  },
  marketTile: {
    background:'linear-gradient(180deg, rgba(30,35,40,0.96), rgba(9,11,14,0.96))',
    border:'1px solid rgba(255,255,255,0.06)',
    borderTop:'1px solid rgba(244,178,79,0.28)',
    borderRadius:'2px',
    padding:'8px 10px',
    boxShadow:'none',
  },
  tabs: {
    display:'flex',
    gap:'1px',
    background:'#060709',
    borderBottom:'1px solid rgba(255,170,86,0.12)',
    padding:'0 12px',
    overflowX:'auto',
  },
  tab: {
    padding:'11px 14px',
    cursor:'pointer',
    color:'#8a9099',
    transition:'all .15s',
    fontWeight:700,
    fontSize:'10px',
    letterSpacing:'1.6px',
    textTransform:'uppercase',
    background:'linear-gradient(180deg, rgba(30,34,38,0.96), rgba(10,12,14,0.96))',
    border:'1px solid rgba(255,255,255,0.04)',
    borderBottom:'1px solid transparent',
    borderTopLeftRadius:'2px',
    borderTopRightRadius:'2px',
    marginTop:'8px',
    minWidth:'fit-content',
  },
  tabActive: {
    color:'#f4b24f',
    borderColor:'rgba(244,178,79,0.28)',
    borderBottomColor:'#060709',
    background:'linear-gradient(180deg, rgba(52,37,17,0.96), rgba(17,15,12,0.98))',
    boxShadow:'none',
  },
  selectorBar: {
    background:'linear-gradient(180deg, rgba(16,19,22,0.98), rgba(5,7,9,0.98))',
    borderBottom:'1px solid rgba(255,255,255,0.05)',
    padding:'10px 18px',
    display:'flex',
    gap:'8px',
    alignItems:'center',
    overflowX:'auto',
  },
  selectorLabel: { color:'#767d86', fontSize:'10px', letterSpacing:'1.5px', textTransform:'uppercase', marginRight:'6px' },
  card: {
    background:'linear-gradient(180deg, rgba(22,26,30,0.98), rgba(7,9,11,0.99))',
    border:'1px solid rgba(255,255,255,0.07)',
    borderRadius:'2px',
    padding:'14px 16px',
    boxShadow:'0 8px 20px rgba(0,0,0,0.16)',
  },
  cardTitle: {
    color:'#f0a33a',
    fontSize:'10px',
    letterSpacing:'1.8px',
    textTransform:'uppercase',
    marginBottom:'8px',
    fontWeight:700,
  },
  positive: { color:'#00e676' },
  negative: { color:'#ff4444' },
  neutral: { color:'#e0e0e0' },
  grid: (cols) => {
    const minWidth = Math.min(280, Math.max(180, Math.floor(1120 / Math.max(cols, 1))));
    return { display:'grid', gridTemplateColumns:`repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap:'12px' };
  },
  section: { padding:'18px 18px 28px' },
  tableWrapper: {
    overflowX:'auto',
    overflowY:'hidden',
    border:'1px solid rgba(255,255,255,0.04)',
    background:'rgba(0,0,0,0.18)',
  },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'11px' },
  th: {
    padding:'8px 12px',
    textAlign:'left',
    color:'#f0a33a',
    fontWeight:700,
    borderBottom:'1px solid rgba(255,170,86,0.14)',
    fontSize:'9px',
    letterSpacing:'1.4px',
    textTransform:'uppercase',
    background:'linear-gradient(180deg, rgba(45,31,15,0.62), rgba(15,16,18,0.98))',
    whiteSpace:'nowrap',
  },
  td: {
    padding:'8px 12px',
    borderBottom:'1px solid rgba(255,255,255,0.04)',
    color:'#cfd4db',
    whiteSpace:'nowrap',
  },
  badge: (color) => ({
    background:`linear-gradient(180deg, ${color}33, rgba(10,12,14,0.95))`,
    border:`1px solid ${color}55`,
    color,
    padding:'2px 8px',
    borderRadius:'2px',
    fontSize:'9px',
    fontWeight:700,
    letterSpacing:'1px',
  }),
  btn: {
    background:'linear-gradient(180deg, rgba(36,41,46,0.96), rgba(10,12,15,0.96))',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#d8dce2',
    padding:'6px 14px',
    borderRadius:'2px',
    cursor:'pointer',
    fontSize:'11px',
    fontWeight:700,
    letterSpacing:'1px',
    boxShadow:'none',
  },
  btnActive: {
    background:'linear-gradient(180deg, rgba(70,45,18,0.96), rgba(21,18,14,0.98))',
    border:'1px solid rgba(244,178,79,0.34)',
    color:'#f4b24f',
  },
  input: {
    background:'linear-gradient(180deg, rgba(14,17,20,0.96), rgba(7,9,11,0.98))',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#f4f6f8',
    padding:'8px 12px',
    borderRadius:'2px',
    fontSize:'12px',
    width:'100%',
    boxSizing:'border-box',
    boxShadow:'none',
  },
  uploadBox: {
    border:'1px dashed rgba(244,178,79,0.28)',
    borderRadius:'2px',
    padding:'24px',
    textAlign:'center',
    cursor:'pointer',
    transition:'all .2s',
    background:'linear-gradient(180deg, rgba(22,25,29,0.58), rgba(7,9,11,0.78))',
  },
  row: { display:'flex', gap:'12px', alignItems:'center' },
  col: { display:'flex', flexDirection:'column', gap:'8px' },
};

function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return `rgba(255,255,255,${alpha})`;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function signalPanelStyle(color = '#9aa4b2') {
  return {
    ...S.card,
    background:[
      `linear-gradient(180deg, ${hexToRgba(color, 0.12)}, rgba(7,9,11,0) 44%)`,
      'linear-gradient(180deg, rgba(22,26,30,0.98), rgba(6,8,10,0.99))',
    ].join(','),
    borderColor: hexToRgba(color, 0.22),
    boxShadow:`inset 0 0 0 1px ${hexToRgba(color, 0.06)}, 0 8px 18px rgba(0,0,0,0.14)`,
  };
}

function buildDailyReturnMap(series) {
  if (!series?.length || series.length < 2) return new Map();
  const returns = new Map();
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1]?.[1];
    const curr = series[i]?.[1];
    const date = series[i]?.[0];
    if (!date || !Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    returns.set(date, (curr - prev) / prev);
  }
  return returns;
}

function computeCorrelation(aMap, bMap) {
  if (!aMap?.size || !bMap?.size) return { value: null, observations: 0 };
  const xs = [];
  const ys = [];
  const [smaller, larger] = aMap.size <= bMap.size ? [aMap, bMap] : [bMap, aMap];
  smaller.forEach((value, date) => {
    if (!larger.has(date)) return;
    const paired = larger.get(date);
    if (!Number.isFinite(value) || !Number.isFinite(paired)) return;
    xs.push(aMap.get(date));
    ys.push(bMap.get(date));
  });
  const n = xs.length;
  if (n < 3) return { value: null, observations: n };
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX <= 0 || varY <= 0) return { value: null, observations: n };
  return {
    value: cov / Math.sqrt(varX * varY),
    observations: n,
  };
}

function correlationColor(value) {
  if (!Number.isFinite(value)) return 'rgba(85, 92, 102, 0.18)';
  const clamped = Math.max(-1, Math.min(1, value));
  if (Math.abs(clamped) < 0.0001) return 'rgba(120, 128, 138, 0.18)';
  if (clamped > 0) return `rgba(0, 230, 118, ${0.14 + Math.abs(clamped) * 0.42})`;
  return `rgba(255, 68, 68, ${0.14 + Math.abs(clamped) * 0.42})`;
}

function formatDeskTime(timeZone, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit',
    hour12:false,
    ...options,
  }).format(new Date());
}

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, mode='pct' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'linear-gradient(180deg, rgba(24,28,32,0.99), rgba(8,10,12,0.99))', border:'1px solid rgba(244,178,79,0.16)', boxShadow:'0 10px 20px rgba(0,0,0,0.28)', padding:'10px 14px', borderRadius:'2px', fontSize:'11px' }}>
      <div style={{ color:'#f0a33a', marginBottom:'6px', letterSpacing:'1px', textTransform:'uppercase', fontSize:'10px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom:'2px' }}>
          <span style={{color:'#9aa3ad'}}>{p.name}: </span>
          {mode==='pct' ? fmtPct(p.value) : mode==='$' ? fmt$(p.value) : fmtNum(p.value)}
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const persistedRef = useRef(loadPersistedAppState());
  const persisted = persistedRef.current || {};
  const sharedSeedRef = useRef(buildSharedDashboardStatePayload({
    accounts: persisted.accounts,
    balanceHistory: persisted.balanceHistory,
    realizedTrades: persisted.realizedTrades,
    sectorTargetsByAccount: persisted.sectorTargetsByAccount || persisted.sectorTargets,
    sectorOverrides: persisted.sectorOverrides,
  }));
  const lastSharedStateSignatureRef = useRef(getSharedDashboardStateSignature(sharedSeedRef.current));
  const sharedStateUpdatedAtRef = useRef(null);

  const [tab, setTab] = useState('overview');
  const [timeframe, setTimeframe] = useState(persisted.timeframe || '1Y');
  const [sectorTimeframe, setSectorTimeframe] = useState(persisted.sectorTimeframe || '1Y');
  const [realizedTimeframe, setRealizedTimeframe] = useState(persisted.realizedTimeframe || 'YTD');
  const [accounts, setAccounts] = useState(sharedSeedRef.current.accounts);
  const [balanceHistory, setBalanceHistory] = useState(sharedSeedRef.current.balanceHistory);
  const [realizedTrades, setRealizedTrades] = useState(sharedSeedRef.current.realizedTrades);
  const [spxData, setSpxData] = useState([]);
  const [sectorBenchmarkData, setSectorBenchmarkData] = useState({});
  const [securityHistoryData, setSecurityHistoryData] = useState(() => loadJSONStorage(SECURITY_HISTORY_STORAGE_KEY, {}));
  const [spxLoading, setSpxLoading] = useState(false);
  const [securityHistoryLoading, setSecurityHistoryLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({});
  const [selectedAccount, setSelectedAccount] = useState(persisted.selectedAccount || 'ALL');
  const [showBenchmark, setShowBenchmark] = useState(persisted.showBenchmark ?? true);
  const [selectedSector, setSelectedSector] = useState(persisted.selectedSector || SP500_SECTORS[0].name);
  const [riskMatrixMode, setRiskMatrixMode] = useState(persisted.riskMatrixMode || 'sectors');
  const [sectorTargetsByAccount, setSectorTargetsByAccount] = useState(sharedSeedRef.current.sectorTargetsByAccount);
  const [sectorOverrides, setSectorOverrides] = useState(sharedSeedRef.current.sectorOverrides);
  const [performanceChartSelection, setPerformanceChartSelection] = useState(() =>
    normalizePerformanceChartSelection(persisted.performanceChartSelection, [], persisted.showBenchmark ?? true),
  );
  const [sharedStateReady, setSharedStateReady] = useState(false);
  const [sharedStateUpdatedAt, setSharedStateUpdatedAt] = useState(null);
  const [sharedSyncStatus, setSharedSyncStatus] = useState('Booting shared workspace');

  // Load SPX and sector ETF benchmarks using the proxied Stooq daily history feed.
  const loadBenchmarks = useCallback(async ({ forceRefresh = false } = {}) => {
    setSpxLoading(true);
    try {
      const cached = loadJSONStorage(MARKET_CACHE_STORAGE_KEY, null);
      if (!forceRefresh && cached?.spxData?.length) setSpxData(cached.spxData);
      if (!forceRefresh && cached?.sectorBenchmarkData) setSectorBenchmarkData(cached.sectorBenchmarkData);

      const requests = [
        { key: 'SPX', symbol: '^GSPC' },
        ...SP500_SECTORS.map(({ name, etf }) => ({ key: name, symbol: etf })),
      ];
      let nextSPXData = cached?.spxData || [];
      const nextSectorData = {};

      for (const request of requests) {
        try {
          const series = await loadBenchmarkHistorySeries(request.symbol, { days: 3650, retries: 2 });
          if (request.key === 'SPX') {
            nextSPXData = series;
            setSpxData(series);
          }
          else nextSectorData[request.key] = series;
        } catch (error) {
          console.warn(`Benchmark fetch failed for ${request.key}`, error);
          if (request.key !== 'SPX' && cached?.sectorBenchmarkData?.[request.key]) {
            nextSectorData[request.key] = cached.sectorBenchmarkData[request.key];
          }
        }

        await new Promise(resolve => setTimeout(resolve, 75));
      }

      setSectorBenchmarkData(nextSectorData);
      saveJSONStorage(MARKET_CACHE_STORAGE_KEY, {
        provider: 'stooq',
        updatedAt: new Date().toISOString(),
        spxData: nextSPXData,
        sectorBenchmarkData: nextSectorData,
      });
    } catch (e) {
      console.warn('Benchmark fetch failed', e);
    }
    setSpxLoading(false);
  }, []);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  const applySharedDashboardState = useCallback((rawState, updatedAt = null) => {
    const normalized = buildSharedDashboardStatePayload(rawState);
    lastSharedStateSignatureRef.current = getSharedDashboardStateSignature(normalized);
    sharedStateUpdatedAtRef.current = updatedAt || null;
    setAccounts(normalized.accounts);
    setBalanceHistory(normalized.balanceHistory);
    setRealizedTrades(normalized.realizedTrades);
    setSectorTargetsByAccount(normalized.sectorTargetsByAccount);
    setSectorOverrides(normalized.sectorOverrides);
    setSharedStateUpdatedAt(updatedAt || null);
    setSharedStateReady(true);
    setSharedSyncStatus(updatedAt ? 'Shared workspace synced' : 'Shared workspace ready');
    return normalized;
  }, []);

  const fetchSharedDashboardState = useCallback(async ({ silent = false, preferLocalSeed = false } = {}) => {
    if (!silent) setSharedSyncStatus(preferLocalSeed ? 'Loading shared workspace' : 'Refreshing shared workspace');
    try {
      const response = await fetch(SHARED_DASHBOARD_STATE_ENDPOINT, { cache:'no-store' });
      if (!response.ok) throw new Error(`Shared state fetch failed (${response.status})`);
      const payload = await response.json();
      const updatedAt = payload?.updated_at || null;
      const remoteState = buildSharedDashboardStatePayload(payload?.state || {});
      const remoteHasContent = hasSharedDashboardStateContent(remoteState);
      const remoteSignature = getSharedDashboardStateSignature(remoteState);

      if ((remoteHasContent || !preferLocalSeed)
        && remoteSignature === lastSharedStateSignatureRef.current
        && updatedAt === sharedStateUpdatedAtRef.current) {
        setSharedStateReady(true);
        sharedStateUpdatedAtRef.current = updatedAt;
        setSharedStateUpdatedAt(updatedAt);
        if (!silent) setSharedSyncStatus('Shared workspace live');
        return payload;
      }

      if (remoteHasContent || !preferLocalSeed) {
        applySharedDashboardState(remoteState, updatedAt);
      } else {
        const localSeed = sharedSeedRef.current;
        sharedStateUpdatedAtRef.current = updatedAt;
        setSharedStateUpdatedAt(updatedAt);
        setSharedStateReady(true);
        if (hasSharedDashboardStateContent(localSeed)) {
          lastSharedStateSignatureRef.current = "";
          setSharedSyncStatus('Publishing local workspace cache');
        } else {
          lastSharedStateSignatureRef.current = getSharedDashboardStateSignature(remoteState);
          setSharedSyncStatus('Shared workspace ready');
        }
      }
      return payload;
    } catch (error) {
      console.warn('Shared workspace fetch failed', error);
      if (!sharedStateReady && hasSharedDashboardStateContent(sharedSeedRef.current)) {
        lastSharedStateSignatureRef.current = "";
      }
      setSharedStateReady(true);
      setSharedSyncStatus('Shared sync unavailable - using local cache');
      return null;
    }
  }, [applySharedDashboardState, sharedStateReady]);

  useEffect(() => {
    fetchSharedDashboardState({ preferLocalSeed: true });
  }, [fetchSharedDashboardState]);

  useEffect(() => {
    if (!sharedStateReady) return undefined;
    const intervalId = window.setInterval(() => {
      fetchSharedDashboardState({ silent: true, preferLocalSeed: false });
    }, SHARED_DASHBOARD_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchSharedDashboardState, sharedStateReady]);

  useEffect(() => {
    if (!sharedStateReady) return undefined;

    const payload = buildSharedDashboardStatePayload({
      accounts,
      balanceHistory,
      realizedTrades,
      sectorTargetsByAccount,
      sectorOverrides,
    });
    const signature = getSharedDashboardStateSignature(payload);

    if (signature === lastSharedStateSignatureRef.current) return undefined;

    const timeoutId = window.setTimeout(async () => {
      if (signature === lastSharedStateSignatureRef.current) return;

      try {
        setSharedSyncStatus('Saving shared workspace');
        const response = await fetch(SHARED_DASHBOARD_STATE_ENDPOINT, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ state: payload }),
        });
        if (!response.ok) throw new Error(`Shared state save failed (${response.status})`);
        const result = await response.json();
        lastSharedStateSignatureRef.current = signature;
        sharedStateUpdatedAtRef.current = result?.updated_at || null;
        setSharedStateUpdatedAt(result?.updated_at || null);
        setSharedSyncStatus('Shared workspace live');
      } catch (error) {
        console.warn('Shared workspace save failed', error);
        setSharedSyncStatus('Shared sync failed - local cache only');
      }
    }, SHARED_DASHBOARD_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [sharedStateReady, accounts, balanceHistory, realizedTrades, sectorTargetsByAccount, sectorOverrides]);

  useEffect(() => {
    saveJSONStorage(APP_STATE_STORAGE_KEY, {
      timeframe,
      sectorTimeframe,
      realizedTimeframe,
      accounts,
      balanceHistory,
      realizedTrades,
      selectedAccount,
      showBenchmark,
      selectedSector,
      riskMatrixMode,
      sectorTargetsByAccount,
      sectorOverrides,
      performanceChartSelection,
    });
  }, [timeframe, sectorTimeframe, realizedTimeframe, accounts, balanceHistory, realizedTrades, selectedAccount, showBenchmark, selectedSector, riskMatrixMode, sectorTargetsByAccount, sectorOverrides, performanceChartSelection]);

  useEffect(() => {
    saveJSONStorage(SECURITY_HISTORY_STORAGE_KEY, securityHistoryData);
  }, [securityHistoryData]);

  const resetAllData = useCallback(() => {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Delete all uploaded accounts, balance history, realized trades, saved weights, and cached benchmark data?");
    if (!confirmed) return;

    const clearedSharedState = buildSharedDashboardStatePayload({
      accounts: {},
      balanceHistory: {},
      realizedTrades: [],
      sectorTargetsByAccount: {},
      sectorOverrides: {},
    });
    const clearedSignature = getSharedDashboardStateSignature(clearedSharedState);

    setAccounts({});
    setBalanceHistory({});
    setRealizedTrades([]);
    setUploadStatus({});
    setSelectedAccount('ALL');
    setSectorTargetsByAccount({});
    setSectorOverrides({});
    setSpxData([]);
    setSectorBenchmarkData({});
    setSecurityHistoryData({});
    setSecurityHistoryLoading(false);
    setSelectedSector(SP500_SECTORS[0].name);
    setRiskMatrixMode('sectors');
    setShowBenchmark(true);
    setTimeframe('1Y');
    setSectorTimeframe('1Y');
    setRealizedTimeframe('YTD');
    setPerformanceChartSelection(normalizePerformanceChartSelection(null, [], true));
    clearJSONStorage(APP_STATE_STORAGE_KEY);
    LEGACY_APP_STATE_STORAGE_KEYS.forEach(clearJSONStorage);
    clearJSONStorage(MARKET_CACHE_STORAGE_KEY);
    clearJSONStorage(SECURITY_HISTORY_STORAGE_KEY);
    setSharedSyncStatus('Clearing shared workspace');
    fetch(SHARED_DASHBOARD_STATE_ENDPOINT, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ state: clearedSharedState }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Shared state clear failed (${response.status})`);
        const result = await response.json();
        lastSharedStateSignatureRef.current = clearedSignature;
        sharedStateUpdatedAtRef.current = result?.updated_at || null;
        setSharedStateUpdatedAt(result?.updated_at || null);
        setSharedSyncStatus('Shared workspace live');
      })
      .catch((error) => {
        console.warn('Shared workspace clear failed', error);
        setSharedSyncStatus('Shared sync failed - local cache only');
      });
  }, []);

  // File upload handlers
  const handlePositionsUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parsePositionsCSV(e.target.result);
        setAccounts(parsed);
        setUploadStatus(s => ({ ...s, positions: `✓ ${Object.keys(parsed).length} accounts, ${Object.values(parsed).reduce((a,acc)=>a+acc.positions.length,0)} positions` }));
      } catch(err) { setUploadStatus(s => ({ ...s, positions: `✗ Parse error: ${err.message}` })); }
    };
    reader.readAsText(file);
  }, []);

  const handleBalancesUpload = useCallback(async (fileInput) => {
    const files = Array.isArray(fileInput) ? fileInput : [fileInput].filter(Boolean);
    if (!files.length) return;

    try {
      const parsedResults = await Promise.all(
        files.map(async (file) => {
          const text = await file.text();
          return parseBalancesCSV(text, file.name);
        }),
      );

      setBalanceHistory((prev) => ({
        ...prev,
        ...Object.fromEntries(parsedResults.map(({ account, data }) => [account, data])),
      }));

      if (parsedResults.length === 1) {
        const { account, data } = parsedResults[0];
        setUploadStatus((s) => ({
          ...s,
          balances: `✓ ${account}: ${data.length} rows (${data[0]?.[0]} – ${data[data.length - 1]?.[0]})`,
        }));
        return;
      }

      const accountCount = new Set(parsedResults.map(({ account }) => account)).size;
      const totalRows = parsedResults.reduce((sum, { data }) => sum + (data?.length || 0), 0);
      setUploadStatus((s) => ({
        ...s,
        balances: `✓ ${files.length} balance files loaded · ${accountCount} accounts · ${totalRows} rows`,
      }));
    } catch (err) {
      setUploadStatus((s) => ({ ...s, balances: `✗ Parse error: ${err.message}` }));
    }
  }, []);

  const handleRealizedUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const trades = parseRealizedCSV(e.target.result);
        setRealizedTrades(trades);
        const accountCount = new Set(trades.map(t => t.account)).size;
        setUploadStatus(s => ({
          ...s,
          realized: trades.length
            ? `✓ ${trades.length} trades across ${accountCount} accounts`
            : '✗ No realized lot rows found. Use the "Realized Gain/Loss - Lot Details" CSV export.',
        }));
      } catch(err) { setUploadStatus(s => ({ ...s, realized: `✗ Parse error: ${err.message}` })); }
    };
    reader.readAsText(file);
  }, []);

  // Derived: account list
  const accountList = useMemo(() => {
    const fromPositions = Object.keys(accounts);
    const fromBalances = Object.keys(balanceHistory);
    const all = [...new Set([...fromPositions, ...fromBalances])].filter(k=>k!=='ALL');
    return all;
  }, [accounts, balanceHistory]);

  useEffect(() => {
    setPerformanceChartSelection((prev) => {
      const normalized = normalizePerformanceChartSelection(prev, accountList, prev?.spx ?? showBenchmark);
      const sameAggregate = normalized.aggregate === prev?.aggregate;
      const sameSPX = normalized.spx === prev?.spx;
      const prevAccounts = prev?.accounts || {};
      const sameAccounts = accountList.length === Object.keys(prevAccounts).length
        && accountList.every((name) => normalized.accounts[name] === !!prevAccounts[name]);
      return sameAggregate && sameSPX && sameAccounts ? prev : normalized;
    });
  }, [accountList, showBenchmark]);

  useEffect(() => {
    setSectorTargetsByAccount((prev) => {
      const normalized = normalizeSectorTargetsByAccount(prev, accountList);
      const prevKeys = Object.keys(prev || {}).sort();
      const nextKeys = Object.keys(normalized).sort();
      if (prevKeys.length === nextKeys.length && prevKeys.every((key, index) => key === nextKeys[index])) {
        const sameValues = nextKeys.every((key) => JSON.stringify(prev[key]) === JSON.stringify(normalized[key]));
        if (sameValues) return prev;
      }
      return normalized;
    });
  }, [accountList]);

  useEffect(() => {
    if (selectedAccount !== 'ALL' && !accountList.includes(selectedAccount)) setSelectedAccount('ALL');
  }, [accountList, selectedAccount]);

  const selectedAccountsData = useMemo(
    () => (selectedAccount === 'ALL' ? Object.values(accounts) : [accounts[selectedAccount]].filter(Boolean)),
    [accounts, selectedAccount],
  );

  const selectedPositions = useMemo(
    () => selectedAccountsData.flatMap((accountData) => (accountData?.positions || []).map((position) => {
      const override = sectorOverrides[getSectorOverrideKey(position.account, position.overrideSymbol || position.symbol)]
        || sectorOverrides[getSectorOverrideKey(position.account, position.symbol)]
        || sectorOverrides[getSectorOverrideKey(position.account, position.normalizedSymbol)]
        || sectorOverrides[getSectorOverrideKey(position.account, position.baseSymbol)];
      const assignedSector = override && override !== SECTOR_OVERRIDE_AUTO
        ? override
        : (position.mainSector || UNCLASSIFIED_SECTOR);
      const mainSector = ALL_SECTOR_SET.has(assignedSector) ? assignedSector : null;
      return {
        ...position,
        sector: assignedSector,
        mainSector,
        isSectorETF: !!(mainSector && SECTOR_TO_ETF[mainSector] && position.cleanSym === SECTOR_TO_ETF[mainSector]),
      };
    })),
    [selectedAccountsData, sectorOverrides],
  );

  const selectedRealizedTrades = useMemo(
    () => (selectedAccount === 'ALL' ? realizedTrades : realizedTrades.filter(t => t.account === selectedAccount)).map((trade) => {
      const tradeOverrideKey = getRealizedTradeOverrideKey(trade);
      const override = (tradeOverrideKey ? sectorOverrides[tradeOverrideKey] : null)
        || sectorOverrides[getSectorOverrideKey(trade.account, trade.baseSym)]
        || sectorOverrides[getSectorOverrideKey(trade.account, trade.symbol)];
      const assignedSector = override && override !== SECTOR_OVERRIDE_AUTO
        ? override
        : (trade.mainSector || UNCLASSIFIED_SECTOR);
      return {
        ...trade,
        tradeOverrideKey,
        tradeSectorOverride: tradeOverrideKey ? (sectorOverrides[tradeOverrideKey] || null) : null,
        sector: assignedSector,
        mainSector: ALL_SECTOR_SET.has(assignedSector) ? assignedSector : null,
      };
    }),
    [realizedTrades, selectedAccount, sectorOverrides],
  );

  const selectedRealizedTradesWithDates = useMemo(
    () => selectedRealizedTrades.map((trade) => ({ ...trade, closedDateISO: normalizeDateInput(trade.closedDate) })),
    [selectedRealizedTrades],
  );
  const realizedDateBounds = useMemo(
    () => getTimeframeBounds(realizedTimeframe),
    [realizedTimeframe],
  );
  const filteredRealizedTrades = useMemo(
    () => filterTradesByDateRange(selectedRealizedTradesWithDates, realizedDateBounds.startDate, realizedDateBounds.endDate),
    [selectedRealizedTradesWithDates, realizedDateBounds],
  );

  // Derived: active balance series
  const activeHistory = useMemo(() => {
    if (selectedAccount === 'ALL') return buildAggregateHistory(balanceHistory);
    return balanceHistory[selectedAccount] || [];
  }, [selectedAccount, balanceHistory]);

  const aggregateHistory = useMemo(() => buildAggregateHistory(balanceHistory), [balanceHistory]);
  const accountColorMap = useMemo(
    () => Object.fromEntries(accountList.map((name, index) => [name, ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]])),
    [accountList],
  );
  const accountValueMap = useMemo(
    () => Object.fromEntries(accountList.map((accountName) => {
      const positionTotal = accounts[accountName]?.total;
      const historyTotal = balanceHistory[accountName]?.[balanceHistory[accountName].length - 1]?.[1];
      return [accountName, Number.isFinite(positionTotal) && positionTotal > 0 ? positionTotal : (Number.isFinite(historyTotal) ? historyTotal : 0)];
    })),
    [accountList, accounts, balanceHistory],
  );
  const editableSectorScope = selectedAccount === 'ALL' ? null : selectedAccount;
  const resolvedSectorTargets = useMemo(() => {
    if (editableSectorScope) {
      return sectorTargetsByAccount[editableSectorScope] || buildInitialSectorTargets();
    }

    if (!accountList.length) {
      return sectorTargetsByAccount.ALL || buildInitialSectorTargets();
    }

    const totalValue = accountList.reduce((sum, accountName) => sum + (accountValueMap[accountName] || 0), 0);
    if (totalValue <= 0) {
      return sectorTargetsByAccount.ALL || buildInitialSectorTargets();
    }

    return Object.fromEntries(ALL_SECTORS.map(({ name }) => {
      let benchmarkWeight = 0;
      let targetWeight = 0;
      accountList.forEach((accountName) => {
        const mix = (accountValueMap[accountName] || 0) / totalValue;
        const targetSet = sectorTargetsByAccount[accountName] || sectorTargetsByAccount.ALL || buildInitialSectorTargets();
        benchmarkWeight += (targetSet[name]?.benchmarkWeight ?? 0) * mix;
        targetWeight += (targetSet[name]?.targetWeight ?? targetSet[name]?.benchmarkWeight ?? 0) * mix;
      });
      return [name, {
        benchmarkWeight: parseFloat(benchmarkWeight.toFixed(4)),
        targetWeight: parseFloat(targetWeight.toFixed(4)),
      }];
    }));
  }, [editableSectorScope, sectorTargetsByAccount, accountList, accountValueMap]);

  const filteredHistory = useMemo(() => filterByTimeframe(activeHistory, timeframe), [activeHistory, timeframe]);
  const filteredSPX = useMemo(() => filterByTimeframe(spxData, timeframe), [spxData, timeframe]);
  const sectorAccountHistory = useMemo(() => filterByTimeframe(activeHistory, sectorTimeframe), [activeHistory, sectorTimeframe]);
  const currentAccountValue = useMemo(() => {
    const positionsTotal = selectedAccountsData.reduce((sum, accountData) => {
      const total = accountData?.total;
      return sum + (Number.isFinite(total) ? total : 0);
    }, 0);
    if (positionsTotal > 0) return positionsTotal;

    const historyTotal = activeHistory[activeHistory.length - 1]?.[1];
    if (Number.isFinite(historyTotal) && historyTotal > 0) return historyTotal;

    return selectedPositions.reduce((sum, p) => sum + Math.abs(p.mktVal || 0), 0);
  }, [selectedAccountsData, activeHistory, selectedPositions]);
  const sectorStartAccountValue = sectorAccountHistory[0]?.[1] || currentAccountValue;

  const trackedSecuritySymbols = useMemo(() => {
    const symbolMap = new Map();
    for (const position of selectedPositions) {
      if (!position.mainSector || position.isSectorETF || !position.historySymbol) continue;
      const key = getSecurityHistoryCacheKey(position.historySymbol);
      if (!key || symbolMap.has(key)) continue;
      symbolMap.set(key, position.historySymbol);
    }
    return [...symbolMap.entries()].map(([key, symbol]) => ({ key, symbol }));
  }, [selectedPositions]);

  useEffect(() => {
    const missingSymbols = trackedSecuritySymbols.filter(({ key }) => !securityHistoryData[key]?.length);
    if (!missingSymbols.length) return undefined;

    let cancelled = false;

    (async () => {
      setSecurityHistoryLoading(true);
      const loaded = {};

      for (const { key, symbol } of missingSymbols) {
        try {
          loaded[key] = await loadBenchmarkHistorySeries(symbol, { days: 3650, retries: 2 });
        } catch (error) {
          console.warn(`Security history fetch failed for ${symbol}`, error);
        }

        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      if (!cancelled && Object.keys(loaded).length) {
        setSecurityHistoryData((prev) => ({ ...prev, ...loaded }));
      }
      if (!cancelled) setSecurityHistoryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [trackedSecuritySymbols, securityHistoryData]);

  const performanceSeriesDefinitions = useMemo(() => {
    const definitions = [];

    if (performanceChartSelection.aggregate && aggregateHistory.length) {
      definitions.push({
        key: '__portfolio__',
        label: 'Aggregate Portfolio',
        color: '#00d4ff',
        strokeWidth: 2.25,
        data: filterByTimeframe(aggregateHistory, timeframe),
      });
    }

    accountList.forEach((accountName, accountIndex) => {
      if (!performanceChartSelection.accounts?.[accountName]) return;
      const history = balanceHistory[accountName] || [];
      if (!history.length) return;
      definitions.push({
        key: getPerformanceSeriesKey(accountName, accountIndex),
        label: accountName,
        color: accountColorMap[accountName] || '#e0e0e0',
        strokeWidth: selectedAccount === accountName ? 2.5 : 1.8,
        data: filterByTimeframe(history, timeframe),
      });
    });

    if (performanceChartSelection.spx && spxData.length) {
      definitions.push({
        key: '__spx__',
        label: 'SPX',
        color: '#7c4dff',
        strokeWidth: 1.6,
        strokeDasharray: '5 3',
        data: filterByTimeframe(spxData, timeframe),
      });
    }

    return definitions.filter((series) => series.data.length);
  }, [performanceChartSelection, aggregateHistory, accountList, balanceHistory, accountColorMap, selectedAccount, spxData, timeframe]);

  const performanceComparisonData = useMemo(
    () => buildNormalizedComparisonRows(performanceSeriesDefinitions),
    [performanceSeriesDefinitions],
  );

  const performanceSeriesSummary = useMemo(
    () => performanceSeriesDefinitions.map((series) => ({
      ...series,
      periodReturn: computePeriodReturn(series.data),
    })),
    [performanceSeriesDefinitions],
  );

  // Merge portfolio + SPX for chart
  const chartData = useMemo(() => {
    if (!filteredHistory.length) return [];
    const portBase = filteredHistory[0][1];
    const firstDate = filteredHistory[0][0];
    const spxBase = getFirstValueOnOrAfter(filteredSPX, firstDate)?.[1] || null;
    let spxIndex = 0;
    let lastSPXClose = null;

    return filteredHistory.map(([date, nav]) => {
      while (spxIndex < filteredSPX.length && filteredSPX[spxIndex][0] <= date) {
        lastSPXClose = filteredSPX[spxIndex][1];
        spxIndex += 1;
      }
      const portPct = ((nav - portBase) / portBase) * 100;
      const spxPct = spxBase && lastSPXClose !== null ? ((lastSPXClose - spxBase) / spxBase) * 100 : null;
      return { date, nav, portPct: parseFloat(portPct.toFixed(3)), spxPct: spxPct !== null ? parseFloat(spxPct.toFixed(3)) : null };
    });
  }, [filteredHistory, filteredSPX]);

  const stats = useMemo(() => filteredHistory.length >= 2 ? computeReturns(filteredHistory) : null, [filteredHistory]);
  const allTimeStats = useMemo(() => activeHistory.length >= 2 ? computeReturns(activeHistory) : null, [activeHistory]);

  const getPositionHistorySeries = useCallback((position) => {
    if (!position?.mainSector) return [];
    if (position.isSectorETF && position.mainSector && SECTOR_TO_ETF[position.mainSector]) {
      return sectorBenchmarkData[position.mainSector] || [];
    }
    const cacheKey = getSecurityHistoryCacheKey(position.historySymbol || position.symbol);
    return cacheKey ? (securityHistoryData[cacheKey] || []) : [];
  }, [sectorBenchmarkData, securityHistoryData]);

  // Sector analytics from positions + sector ETF total return series.
  const sectorBreakdown = useMemo(() => {
    const sectors = Object.fromEntries(
      ALL_SECTORS.map(({ name, etf }) => [name, { value: 0, cost: 0, etfValue: 0, alphaValue: 0, etf, positions: [], trades: [] }]),
    );

    for (const position of selectedPositions) {
      if (!position.mainSector || !sectors[position.mainSector]) continue;
      const absValue = Math.abs(position.mktVal || 0);
      const absCost = Math.abs(position.costBasis || 0);
      const bucket = sectors[position.mainSector];
      bucket.value += absValue;
      bucket.cost += absCost;
      if (position.isSectorETF) bucket.etfValue += absValue;
      else bucket.alphaValue += absValue;
      bucket.positions.push(position);
    }

    for (const trade of selectedRealizedTradesWithDates) {
      if (!trade.mainSector || !sectors[trade.mainSector]) continue;
      sectors[trade.mainSector].trades.push(trade);
    }

    return ALL_SECTORS.map(({ name, etf, color }) => {
      const benchmarkSymbol = etf || 'SPX';
      const benchmarkSeries = filterByTimeframe(etf ? (sectorBenchmarkData[name] || []) : spxData, sectorTimeframe);
      const totalReturn = computePeriodReturn(benchmarkSeries);
      const benchmarkWeight = resolvedSectorTargets[name]?.benchmarkWeight ?? DEFAULT_SECTOR_BENCHMARK_WEIGHTS[name] ?? 0;
      const targetWeight = resolvedSectorTargets[name]?.targetWeight ?? benchmarkWeight;
      const targetActiveWeight = targetWeight - benchmarkWeight;
      const value = sectors[name].value;
      const cost = sectors[name].cost;
      const actualWeight = currentAccountValue > 0 ? (value / currentAccountValue) * 100 : 0;
      const activeWeight = actualWeight;
      const relativeWeight = actualWeight - benchmarkWeight;
      const actualEtfWeight = currentAccountValue > 0 ? (sectors[name].etfValue / currentAccountValue) * 100 : 0;
      const actualAlphaWeight = currentAccountValue > 0 ? (sectors[name].alphaValue / currentAccountValue) * 100 : 0;
      const windowStartDate = sectorAccountHistory[0]?.[0] || benchmarkSeries[0]?.[0] || activeHistory[0]?.[0] || null;
      const windowEndDate = sectorAccountHistory[sectorAccountHistory.length - 1]?.[0] || benchmarkSeries[benchmarkSeries.length - 1]?.[0] || activeHistory[activeHistory.length - 1]?.[0] || null;
      const targetDollarBase = sectorStartAccountValue * (targetWeight / 100);
      const benchmarkDollarBase = sectorStartAccountValue * (benchmarkWeight / 100);
      const actualDollarBase = sectorStartAccountValue * (actualWeight / 100);
      const sectorTrades = windowStartDate && windowEndDate
        ? filterTradesByDateRange(sectors[name].trades, windowStartDate, windowEndDate)
        : [];
      const realizedCostBase = sectorTrades.reduce((sum, trade) => sum + Math.abs(trade.cost || 0), 0);
      const closedDollarReturn = sectorTrades.reduce((sum, trade) => sum + (trade.gain || 0), 0);

      let openDollarReturn = 0;
      let openInitialAllocation = 0;
      let coveredOpenValue = 0;
      let coveredOpenPositions = 0;

      for (const position of sectors[name].positions) {
        const history = getPositionHistorySeries(position);
        const startPoint = getFirstValueOnOrAfter(history, windowStartDate);
        const endPoint = getLastValueOnOrBefore(history, windowEndDate);
        if (!startPoint || !endPoint) continue;
        openDollarReturn += (position.qty || 0) * (endPoint[1] - startPoint[1]);
        openInitialAllocation += Math.abs((position.qty || 0) * startPoint[1]);
        coveredOpenValue += Math.abs(position.mktVal || 0);
        coveredOpenPositions += 1;
      }

      const totalDollarReturn = openDollarReturn + closedDollarReturn;
      const reconstructedInitialAllocationBase = openInitialAllocation + realizedCostBase;
      const sectorReturnBase = targetDollarBase > 0
        ? targetDollarBase
        : reconstructedInitialAllocationBase > 0
          ? reconstructedInitialAllocationBase
          : actualDollarBase > 0
            ? actualDollarBase
            : value;
      const portfolioRelativeReturn = reconstructedInitialAllocationBase > 0
        ? (totalDollarReturn / reconstructedInitialAllocationBase) * 100
        : sectorReturnBase > 0
          ? (totalDollarReturn / sectorReturnBase) * 100
          : null;
      const targetRelativeReturn = sectorReturnBase > 0 ? (totalDollarReturn / sectorReturnBase) * 100 : null;
      const benchmarkRelativeReturn = benchmarkDollarBase > 0 ? (totalDollarReturn / benchmarkDollarBase) * 100 : null;
      const alphaReturn = benchmarkRelativeReturn !== null && totalReturn !== null ? benchmarkRelativeReturn - totalReturn : null;
      const sleeveAlphaReturn = targetRelativeReturn !== null && totalReturn !== null ? targetRelativeReturn - totalReturn : null;
      const benchmarkReturnDollar = totalReturn !== null && benchmarkDollarBase > 0 ? benchmarkDollarBase * (totalReturn / 100) : null;
      const portfolioContribution = sectorStartAccountValue > 0 ? (totalDollarReturn / sectorStartAccountValue) * 100 : null;
      const sectorReturnBaseLabel = targetDollarBase > 0
        ? 'Target allocation'
        : reconstructedInitialAllocationBase > 0
          ? 'Initial sleeve allocation'
          : actualDollarBase > 0
            ? 'Live actual allocation'
            : 'Current sector value';
      return {
        name,
        etf: benchmarkSymbol,
        benchmarkSymbol,
        usesSPXFallback: !etf,
        hasBenchmark: true,
        color,
        value,
        cost,
        positions: sectors[name].positions,
        trades: sectorTrades,
        actualWeight,
        benchmarkWeight,
        activeWeight,
        relativeWeight,
        targetWeight,
        targetEtfWeight: etf ? Math.max(targetWeight, 0) * 0.7 : 0,
        targetAlphaWeight: etf ? Math.max(targetWeight, 0) * 0.3 : Math.max(targetWeight, 0),
        actualEtfWeight,
        actualAlphaWeight,
        sleeveGap: actualWeight - targetWeight,
        unrealizedGain: value - cost,
        unrealizedReturn: cost > 0 ? ((value - cost) / cost) * 100 : null,
        sectorReturn: targetRelativeReturn,
        benchmarkReturn: totalReturn,
        totalReturn,
        benchmarkDollarBase,
        targetDollarBase,
        initialAllocationDollarBase: reconstructedInitialAllocationBase,
        sectorReturnBase,
        sectorReturnBaseLabel,
        comparisonDollarBase: sectorReturnBase,
        benchmarkReturnDollar,
        portfolioRelativeReturn,
        targetRelativeReturn,
        benchmarkRelativeReturn,
        alphaReturn,
        sleeveAlphaReturn,
        openDollarReturn,
        closedDollarReturn,
        totalDollarReturn,
        portfolioContribution,
        weightedBenchmarkReturn: totalReturn === null ? null : (benchmarkWeight * totalReturn) / 100,
        weightedTargetReturn: totalReturn === null ? null : (targetWeight * totalReturn) / 100,
        weightedActualReturn: portfolioContribution,
        weightedActiveReturn: totalReturn === null ? null : (activeWeight * totalReturn) / 100,
        coverageWeight: value > 0 ? (coveredOpenValue / value) * 100 : 0,
        coveredOpenValue,
        coveredOpenPositions,
        totalOpenPositions: sectors[name].positions.length,
        windowStartDate,
        windowEndDate,
        targetActiveWeight,
        stance: getSectorStance(targetActiveWeight),
      };
    });
  }, [
    activeHistory,
    currentAccountValue,
    getPositionHistorySeries,
    resolvedSectorTargets,
    sectorAccountHistory,
    sectorBenchmarkData,
    sectorStartAccountValue,
    sectorTimeframe,
    selectedPositions,
    selectedRealizedTradesWithDates,
    spxData,
  ]);

  const benchmarkSectorReturn = useMemo(() => {
    const totalBenchmarkBase = sectorBreakdown.reduce((sum, sector) => sum + (sector.benchmarkDollarBase || 0), 0);
    const totalBenchmarkDollarReturn = sectorBreakdown.reduce((sum, sector) => sum + (sector.benchmarkReturnDollar || 0), 0);
    return totalBenchmarkBase > 0 ? (totalBenchmarkDollarReturn / totalBenchmarkBase) * 100 : null;
  }, [sectorBreakdown]);

  const sectorAttribution = useMemo(() => {
    return sectorBreakdown.map((sector) => ({
      ...sector,
      targetAllocationAlpha: sector.sleeveAlphaReturn,
      actualAllocationAlpha: sector.alphaReturn,
    }));
  }, [sectorBreakdown, benchmarkSectorReturn]);

  const sectorChartBars = useMemo(
    () => [...sectorAttribution]
      .map((sector) => ({
        ...sector,
        actualAllocationAlphaDisplay: Number.isFinite(sector.actualAllocationAlpha) ? sector.actualAllocationAlpha : 0,
      }))
      .sort((a, b) => b.actualWeight - a.actualWeight),
    [sectorAttribution],
  );

  const sectorChartHeight = useMemo(
    () => Math.max(340, sectorChartBars.length * 34),
    [sectorChartBars.length],
  );
  const sectorAxisWidth = useMemo(
    () => getCategoryAxisWidth(sectorChartBars.map((sector) => sector.name), 130, 210),
    [sectorChartBars],
  );

  const sectorTotals = useMemo(() => {
    const benchmark = sectorAttribution.reduce((sum, s) => sum + s.benchmarkWeight, 0);
    const target = sectorAttribution.reduce((sum, s) => sum + s.targetWeight, 0);
    const actual = sectorAttribution.reduce((sum, s) => sum + s.actualWeight, 0);
    const classified = sectorAttribution.reduce((sum, s) => sum + s.value, 0);
    const totalComparisonBase = sectorAttribution.reduce((sum, s) => sum + (s.sectorReturnBase || 0), 0);
    const totalAlphaDollar = sectorAttribution.reduce((sum, s) => {
      if ((s.actualAllocationAlpha ?? null) === null || !s.comparisonDollarBase) return sum;
      return sum + ((s.actualAllocationAlpha / 100) * s.comparisonDollarBase);
    }, 0);
    return {
      benchmark,
      target,
      actual,
      benchmarkReturn: benchmarkSectorReturn,
      portfolioRelativeReturn: totalComparisonBase > 0
        ? (sectorAttribution.reduce((sum, s) => sum + (s.totalDollarReturn || 0), 0) / totalComparisonBase) * 100
        : null,
      totalAlphaDollar,
      excludedValue: Math.max(currentAccountValue - classified, 0),
      excludedWeight: currentAccountValue > 0 ? ((currentAccountValue - classified) / currentAccountValue) * 100 : 0,
    };
  }, [benchmarkSectorReturn, currentAccountValue, sectorAttribution]);

  useEffect(() => {
    if (!sectorAttribution.length) return;
    if (!sectorAttribution.some(s => s.name === selectedSector)) setSelectedSector(sectorAttribution[0].name);
  }, [sectorAttribution, selectedSector]);

  const filteredSectorHistory = useMemo(
    () => filterByTimeframe(
      sectorBenchmarkData[selectedSector]
      || (MANUAL_ONLY_SECTORS.some((sector) => sector.name === selectedSector) ? spxData : []),
      sectorTimeframe,
    ),
    [sectorBenchmarkData, selectedSector, sectorTimeframe, spxData],
  );

  const sectorDetail = useMemo(
    () => sectorAttribution.find(s => s.name === selectedSector) || sectorAttribution[0] || null,
    [sectorAttribution, selectedSector],
  );

  useEffect(() => {
    if (!selectedSector || MANUAL_ONLY_SECTORS.some((sector) => sector.name === selectedSector)) return undefined;
    if (sectorBenchmarkData[selectedSector]?.length) return undefined;
    const symbol = SECTOR_TO_ETF[selectedSector];
    if (!symbol) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const series = await loadBenchmarkHistorySeries(symbol, { days: 3650, retries: 2 });
        if (cancelled || !series.length) return;
        setSectorBenchmarkData((prev) => {
          const next = { ...prev, [selectedSector]: series };
          const cached = loadJSONStorage(MARKET_CACHE_STORAGE_KEY, null) || {};
          saveJSONStorage(MARKET_CACHE_STORAGE_KEY, {
            ...cached,
            provider: cached.provider || 'stooq',
            updatedAt: new Date().toISOString(),
            spxData: cached.spxData || spxData,
            sectorBenchmarkData: next,
          });
          return next;
        });
      } catch (error) {
        console.warn(`On-demand benchmark fetch failed for ${selectedSector}`, error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sectorBenchmarkData, selectedSector, spxData]);

  const sectorComparisonChart = useMemo(() => {
    if (!sectorDetail) return [];

    const startDate = sectorDetail.windowStartDate;
    const endDate = sectorDetail.windowEndDate;
    if (!startDate || !endDate) return [];

    const benchmarkBase = getFirstValueOnOrAfter(filteredSectorHistory, startDate)?.[1] ?? null;
    const historyDates = sectorAccountHistory
      .filter(([date]) => date >= startDate && date <= endDate)
      .map(([date]) => date);
    const dates = [...new Set([...filteredSectorHistory.map(([date]) => date), ...historyDates])].sort();
    const closedTrades = filterTradesByDateRange(
      selectedRealizedTradesWithDates.filter((trade) => trade.mainSector === selectedSector),
      startDate,
      endDate,
    ).sort((a, b) => a.closedDateISO.localeCompare(b.closedDateISO));
    const positionInputs = sectorDetail.positions.map((position) => {
      const history = getPositionHistorySeries(position);
      const startPoint = getFirstValueOnOrAfter(history, startDate);
      if (!startPoint) return null;
      return {
        qty: position.qty || 0,
        startPrice: startPoint[1],
        series: history,
      };
    }).filter(Boolean);
    const positionDates = positionInputs.flatMap((input) =>
      input.series
        .filter(([date]) => date >= startDate && date <= endDate)
        .map(([date]) => date),
    );
    const tradeDates = closedTrades
      .map((trade) => trade.closedDateISO || normalizeDateInput(trade.closedDate))
      .filter((date) => date && date >= startDate && date <= endDate);
    const chartDates = [...new Set([...dates, ...positionDates, ...tradeDates])].sort();

    let closedIndex = 0;
    let closedDollarReturn = 0;

    return chartDates.map((date) => {
      while (closedIndex < closedTrades.length && closedTrades[closedIndex].closedDateISO <= date) {
        closedDollarReturn += closedTrades[closedIndex].gain || 0;
        closedIndex += 1;
      }

      const openDollarReturn = positionInputs.reduce((sum, input) => {
        const price = getValueOnOrBefore(input.series, date);
        if (price === null || price === undefined) return sum;
        return sum + input.qty * (price - input.startPrice);
      }, 0);

      const benchmarkValue = getValueOnOrBefore(filteredSectorHistory, date);
      const totalDollarReturn = openDollarReturn + closedDollarReturn;
      return {
        date,
        portfolioPct: sectorDetail.sectorReturnBase > 0 ? (totalDollarReturn / sectorDetail.sectorReturnBase) * 100 : null,
        benchmarkPct: benchmarkBase && benchmarkValue !== null ? ((benchmarkValue - benchmarkBase) / benchmarkBase) * 100 : null,
        totalDollarReturn,
        openDollarReturn,
        closedDollarReturn,
      };
    }).filter((row) => row.portfolioPct !== null || row.benchmarkPct !== null);
  }, [filteredSectorHistory, getPositionHistorySeries, sectorAccountHistory, sectorDetail, selectedRealizedTradesWithDates, selectedSector]);

  const sectorCorrelationItems = useMemo(() => {
    return sectorAttribution
      .filter((sector) => sector.positions.length > 0 || Math.abs(sector.actualWeight) > 0.01)
      .map((sector) => {
        const history = filterByTimeframe(
          sectorBenchmarkData[sector.name]
          || (MANUAL_ONLY_SECTORS.some((manualSector) => manualSector.name === sector.name) ? spxData : []),
          timeframe,
        );
        return {
          key: `sector:${sector.name}`,
          label: sector.name,
          sublabel: sector.benchmarkSymbol,
          color: sector.color,
          valueLabel: fmtPct(sector.actualWeight),
          returns: buildDailyReturnMap(history),
        };
      })
      .filter((item) => item.returns.size >= 3)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sectorAttribution, sectorBenchmarkData, spxData, timeframe]);

  const positionCorrelationItems = useMemo(() => {
    return [...selectedPositions]
      .filter((position) => position.historySymbol || position.isSectorETF)
      .sort((a, b) => Math.abs(b.mktVal || 0) - Math.abs(a.mktVal || 0))
      .slice(0, 12)
      .map((position) => {
        const history = filterByTimeframe(getPositionHistorySeries(position), timeframe);
        return {
          key: `position:${position.account}:${position.symbol}`,
          label: position.symbol,
          sublabel: position.account?.split('...')[1] ? `...${position.account.split('...')[1]}` : position.account,
          color: position.mainSector ? (SECTOR_COLORS[position.mainSector] || '#8f99a3') : '#8f99a3',
          valueLabel: fmt$(position.mktVal),
          returns: buildDailyReturnMap(history),
        };
      })
      .filter((item) => item.returns.size >= 3);
  }, [getPositionHistorySeries, selectedPositions, timeframe]);

  const riskCorrelationItems = useMemo(
    () => (riskMatrixMode === 'positions' ? positionCorrelationItems : sectorCorrelationItems),
    [positionCorrelationItems, riskMatrixMode, sectorCorrelationItems],
  );

  const riskCorrelationMatrix = useMemo(
    () => riskCorrelationItems.map((rowItem, rowIndex) => (
      riskCorrelationItems.map((columnItem, columnIndex) => {
        if (rowIndex === columnIndex) return { value: 1, observations: rowItem.returns.size };
        return computeCorrelation(rowItem.returns, columnItem.returns);
      })
    )),
    [riskCorrelationItems],
  );

  const riskCorrelationMeta = useMemo(() => {
    const seriesCounts = riskCorrelationItems.map((item) => item.returns.size);
    const minObs = seriesCounts.length ? Math.min(...seriesCounts) : 0;
    const maxObs = seriesCounts.length ? Math.max(...seriesCounts) : 0;
    return {
      itemCount: riskCorrelationItems.length,
      minObs,
      maxObs,
    };
  }, [riskCorrelationItems]);

  // Realized P&L by sector
  const realizedBySector = useMemo(() => {
    const sectors = {};
    for (const t of filteredRealizedTrades) {
      if (!t.mainSector || !ALL_SECTOR_SET.has(t.mainSector)) continue;
      if (!sectors[t.mainSector]) sectors[t.mainSector] = { gain: 0, count: 0 };
      sectors[t.mainSector].gain += t.gain;
      sectors[t.mainSector].count++;
    }
    return Object.entries(sectors).map(([name,s]) => ({ name, gain: s.gain, count: s.count })).sort((a,b) => b.gain - a.gain);
  }, [filteredRealizedTrades]);
  const realizedSectorAxisWidth = useMemo(
    () => getCategoryAxisWidth(realizedBySector.map((sector) => sector.name), 120, 210),
    [realizedBySector],
  );
  const realizedSectorChartHeight = useMemo(
    () => Math.max(220, realizedBySector.length * 34),
    [realizedBySector.length],
  );

  // Top positions
  const topPositions = useMemo(() => {
    return [...selectedPositions].sort((a,b) => Math.abs(b.mktVal) - Math.abs(a.mktVal));
  }, [selectedPositions]);

  const updatePositionSectorOverride = useCallback((accountName, symbolInput, nextSector) => {
    const symbols = [...new Set((Array.isArray(symbolInput) ? symbolInput : [symbolInput]).filter(Boolean))];
    const keys = symbols.map((symbol) => getSectorOverrideKey(accountName, symbol));
    if (!keys.length) return;
    setSectorOverrides((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        if (key in next) delete next[key];
      });
      if (!nextSector || nextSector === SECTOR_OVERRIDE_AUTO) {
        return next;
      }
      next[keys[0]] = nextSector;
      return next;
    });
  }, []);

  const updateRealizedTradeSectorOverride = useCallback((trade, nextSector) => {
    const key = getRealizedTradeOverrideKey(trade);
    if (!key) return;
    setSectorOverrides((prev) => {
      const next = { ...prev };
      if (!nextSector || nextSector === SECTOR_OVERRIDE_AUTO) {
        if (key in next) delete next[key];
        return next;
      }
      next[key] = nextSector;
      return next;
    });
  }, []);

  const setSectorAllocationBias = useCallback((sectorName, mode) => {
    if (!editableSectorScope) return;
    setSectorTargetsByAccount(prev => {
      const currentScope = prev[editableSectorScope] || buildInitialSectorTargets();
      const current = currentScope[sectorName] || { benchmarkWeight: 0, targetWeight: 0 };
      const currentTarget = Number.isFinite(current.targetWeight) ? current.targetWeight : current.benchmarkWeight;
      const magnitude = Math.abs(currentTarget - current.benchmarkWeight) || 1;
      const nextActiveWeight = mode === 'equal' ? 0 : mode === 'overweight' ? magnitude : -magnitude;
      return {
        ...prev,
        [editableSectorScope]: {
          ...currentScope,
          [sectorName]: {
            ...current,
            targetWeight: parseFloat((current.benchmarkWeight + nextActiveWeight).toFixed(2)),
          },
        },
      };
    });
  }, [editableSectorScope]);

  const nudgeSectorActiveWeight = useCallback((sectorName, delta) => {
    if (!editableSectorScope) return;
    setSectorTargetsByAccount(prev => {
      const currentScope = prev[editableSectorScope] || buildInitialSectorTargets();
      const current = currentScope[sectorName] || { benchmarkWeight: 0, targetWeight: 0 };
      const currentTarget = Number.isFinite(current.targetWeight) ? current.targetWeight : current.benchmarkWeight;
      return {
        ...prev,
        [editableSectorScope]: {
          ...currentScope,
          [sectorName]: {
            ...current,
            targetWeight: parseFloat((currentTarget + delta).toFixed(2)),
          },
        },
      };
    });
  }, [editableSectorScope]);

  const updateSectorBenchmarkWeight = useCallback((sectorName, nextWeight) => {
    if (!editableSectorScope) return;
    setSectorTargetsByAccount(prev => {
      const currentScope = prev[editableSectorScope] || buildInitialSectorTargets();
      const current = currentScope[sectorName] || { benchmarkWeight: 0, targetWeight: 0 };
      const currentTarget = Number.isFinite(current.targetWeight) ? current.targetWeight : current.benchmarkWeight;
      return {
        ...prev,
        [editableSectorScope]: {
          ...currentScope,
          [sectorName]: {
            ...current,
            benchmarkWeight: nextWeight,
            targetWeight: currentTarget,
          },
        },
      };
    });
  }, [editableSectorScope]);

  const updateSectorTargetWeight = useCallback((sectorName, nextWeight) => {
    if (!editableSectorScope) return;
    setSectorTargetsByAccount(prev => {
      const currentScope = prev[editableSectorScope] || buildInitialSectorTargets();
      const current = currentScope[sectorName] || { benchmarkWeight: 0, targetWeight: 0 };
      return {
        ...prev,
        [editableSectorScope]: {
          ...currentScope,
          [sectorName]: {
            benchmarkWeight: Number.isFinite(current.benchmarkWeight) ? current.benchmarkWeight : 0,
            targetWeight: nextWeight,
          },
        },
      };
    });
  }, [editableSectorScope]);

  const togglePerformanceAggregate = useCallback(() => {
    setPerformanceChartSelection((prev) => ({ ...prev, aggregate: !prev.aggregate }));
  }, []);

  const togglePerformanceSPX = useCallback(() => {
    setPerformanceChartSelection((prev) => ({ ...prev, spx: !prev.spx }));
  }, []);

  const togglePerformanceAccount = useCallback((accountName) => {
    setPerformanceChartSelection((prev) => ({
      ...prev,
      accounts: {
        ...(prev.accounts || {}),
        [accountName]: !prev.accounts?.[accountName],
      },
    }));
  }, []);

  const setAllPerformanceAccounts = useCallback((nextValue) => {
    setPerformanceChartSelection((prev) => ({
      ...prev,
      accounts: Object.fromEntries(accountList.map((accountName) => [accountName, nextValue])),
    }));
  }, [accountList]);

  // Account summary cards
  const accountSummary = useMemo(() => {
    return accountList.map((name, i) => {
      const posData = accounts[name];
      const hist = balanceHistory[name];
      const total = posData?.total || (hist ? hist[hist.length-1]?.[1] : 0);
      const cost = posData?.cost || 0;
      const firstVal = hist?.[0]?.[1];
      const totalReturn = firstVal ? ((total - firstVal) / firstVal) * 100 : null;
      const today = hist?.length >= 2 ? ((hist[hist.length-1][1] - hist[hist.length-2][1]) / hist[hist.length-2][1]) * 100 : null;
      return { name, total, cost, totalReturn, today, color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length], posCount: posData?.positions?.length || 0 };
    });
  }, [accountList, accounts, balanceHistory]);

  const totalPortfolioValue = useMemo(() => accountSummary.reduce((a,s) => a + (s.total||0), 0), [accountSummary]);
  const selectedAccountLabel = selectedAccount === 'ALL'
    ? 'Aggregate Portfolio'
    : selectedAccount.replace('Limit_Liability_Company ', 'LLC ').replace('Individual ', 'Indiv ');
  const deskClocks = [
    { label:'New York', zone:'America/New_York' },
    { label:'London', zone:'Europe/London' },
    { label:'Hong Kong', zone:'Asia/Hong_Kong' },
    { label:'UTC', zone:'UTC' },
  ];
  const sharedSyncTone = !sharedStateReady
    ? '#ffd166'
    : /failed|unavailable/i.test(sharedSyncStatus)
      ? '#ff6b6b'
      : /saving|loading|publishing|refreshing|clearing/i.test(sharedSyncStatus)
        ? '#ffd166'
        : '#00e676';
  const sharedSyncValue = !sharedStateReady
    ? 'Booting'
    : /failed|unavailable/i.test(sharedSyncStatus)
      ? 'Error'
      : /saving|loading|publishing|refreshing|clearing/i.test(sharedSyncStatus)
        ? 'Syncing'
        : 'Shared';
  const terminalStatusTiles = [
    { label:'Scope', value: selectedAccount === 'ALL' ? 'All Accounts' : selectedAccount.split('...')[1] ? `Acct ${selectedAccount.split('...')[1]}` : selectedAccount, tone:'#4ea1ff' },
    { label:'Accounts', value: String(accountList.length), tone:'#f4b24f' },
    { label:'Positions', value: String(selectedPositions.length), tone:'#00e676' },
    { label:'Workspace', value: sharedSyncValue, tone: sharedSyncTone },
    { label:'Benchmarks', value: spxLoading ? 'Syncing' : spxData.length > 0 ? 'Live' : 'Offline', tone: spxLoading ? '#ffd166' : spxData.length > 0 ? '#00e676' : '#ff6b6b' },
    { label:'Realized Rows', value: String(selectedRealizedTrades.length), tone:'#ff9f43' },
    { label:'Build', value: APP_BUILD_VERSION, tone:'#c3a6ff' },
  ];

  const TIMEFRAMES = ['1M','3M','6M','YTD','1Y','2Y','ALL'];
  const TABS = [
    { id:'overview', label:'Overview' },
    { id:'performance', label:'Performance' },
    { id:'positions', label:'Positions' },
    { id:'sectors', label:'Sectors' },
    { id:'realized', label:'Realized P&L' },
    { id:'risk', label:'Risk' },
    { id:'upload', label:'Upload Data' },
  ];

  return (
    <div style={S.app}>
      <div style={S.screen}>
        {/* ── HEADER ── */}
        <div style={S.headerShell}>
          <div style={S.header}>
            <div style={{ display:'flex', alignItems:'center', gap:'18px', flexWrap:'wrap' }}>
              <div style={S.logo}>Barker Capital Desk</div>
              <div style={S.headerMeta}>Multi-Account Portfolio Command Center</div>
              <div style={{ ...S.statusPill, borderColor:'rgba(244,178,79,0.22)', color:'#f4b24f' }}>Client View Ready</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', justifyContent:'flex-end' }}>
              <div style={{ ...S.statusPill, color:'#9aa3ad' }}>{new Date().toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'})}</div>
              <div style={{ ...S.statusPill, borderColor:'rgba(195,166,255,0.22)', color:'#c3a6ff' }}>Build {APP_BUILD_VERSION}</div>
              <div style={{ ...S.statusPill, borderColor:'rgba(78,161,255,0.2)', color:'#9fd0ff' }}>{selectedAccountLabel}</div>
              <div style={{ ...S.statusPill, borderColor:'rgba(0,230,118,0.2)', color: totalPortfolioValue > 0 ? '#6ef3a5' : '#7f8790', minWidth:'132px', textAlign:'right' }}>{fmt$(totalPortfolioValue)}</div>
            </div>
          </div>
          <div style={S.marketRibbon}>
            {deskClocks.map((clock) => (
              <div key={clock.label} style={S.marketTile}>
                <div style={{ color:'#7b8188', fontSize:'9px', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'4px' }}>{clock.label}</div>
                <div style={{ color:'#f7f9fb', fontSize:'18px', fontWeight:700, letterSpacing:'0.8px' }}>{formatDeskTime(clock.zone)}</div>
              </div>
            ))}
            {terminalStatusTiles.map((tile) => (
              <div key={tile.label} style={{ ...S.marketTile, borderTopColor: hexToRgba(tile.tone, 0.4) }}>
                <div style={{ color:'#7b8188', fontSize:'9px', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'4px' }}>{tile.label}</div>
                <div style={{ color: tile.tone, fontSize:'18px', fontWeight:700 }}>{tile.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <div key={t.id} style={{ ...S.tab, ...(tab===t.id ? S.tabActive : {}) }} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>

        {/* ── ACCOUNT SELECTOR ── */}
        {tab !== 'upload' && (
          <div style={S.selectorBar}>
            <span style={S.selectorLabel}>Desk Scope</span>
            {['ALL', ...accountList].map(acc => (
              <button key={acc} onClick={() => setSelectedAccount(acc)}
                style={{
                  ...S.btn,
                  ...(selectedAccount===acc ? S.btnActive : {}),
                  fontSize:'10px',
                  padding:'4px 10px',
                  borderColor: selectedAccount===acc ? 'rgba(244,178,79,0.32)' : 'rgba(255,255,255,0.08)',
                  color: selectedAccount===acc ? '#f4b24f' : '#9ba3ad',
                }}>
                {acc === 'ALL' ? 'ALL' : acc.split('...')[1] ? `...${acc.split('...')[1]}` : acc}
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <div style={{ ...S.statusPill, color:'#9aa3ad' }}>Chart TF {timeframe}</div>
              <div style={{ ...S.statusPill, color:'#9aa3ad' }}>{selectedPositions.length} Live Positions</div>
              <div style={{ ...S.statusPill, color: spxData.length > 0 ? '#6ef3a5' : '#ff8f8f' }}>{spxData.length > 0 ? 'SPX Feed OK' : 'SPX Feed Pending'}</div>
            </div>
          </div>
        )}

        {/* ══════ OVERVIEW TAB ══════ */}
        {tab === 'overview' && (
          <div style={S.section}>
          {/* Stat bar */}
          {allTimeStats && (
            <div style={{ ...S.grid(6), marginBottom:'16px' }}>
              {[
                { label:'Portfolio NAV', val: fmt$(allTimeStats.currentNav), sub: 'Current Value' },
                { label:'Total Return', val: fmtPct(allTimeStats.total), sub: 'Since Inception', color: allTimeStats.total >= 0 ? '#00e676' : '#ff4444' },
                { label:'YTD Return', val: fmtPct(allTimeStats.ytd), sub: '2026', color: allTimeStats.ytd >= 0 ? '#00e676' : '#ff4444' },
                { label:'Max Drawdown', val: fmtPct(-allTimeStats.maxDrawdown), sub: 'Peak to Trough', color:'#ff9800' },
                { label:'Volatility', val: `${fmtNum(allTimeStats.volatility)}%`, sub: 'Annualized' },
                { label:'Sharpe Ratio', val: fmtNum(allTimeStats.sharpe), sub: 'Risk-Adjusted', color: allTimeStats.sharpe >= 1 ? '#00e676' : allTimeStats.sharpe >= 0 ? '#ffd600' : '#ff4444' },
              ].map(({ label, val, sub, color }) => (
                <div key={label} style={signalPanelStyle(color || '#8f99a3')}>
                  <div style={S.cardTitle}>{label}</div>
                  <div style={{ fontSize:'20px', fontWeight:700, color: color || '#e0e0e0', letterSpacing:'-0.5px' }}>{val}</div>
                  <div style={{ fontSize:'10px', color:'#444', marginTop:'2px' }}>{sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* Mini chart + account cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'12px', marginBottom:'16px' }}>
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
                <div style={S.cardTitle}>PORTFOLIO vs SPX — {selectedAccount === 'ALL' ? 'Aggregate Portfolio' : selectedAccount}</div>
                <div style={{ display:'flex', gap:'6px' }}>
                  {TIMEFRAMES.map(tf => (
                    <button key={tf} onClick={() => setTimeframe(tf)}
                      style={{ ...S.btn, ...(timeframe===tf ? S.btnActive : {}), padding:'3px 8px', fontSize:'10px' }}>{tf}</button>
                  ))}
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={236}>
                  <LineChart data={chartData} margin={{ top:10, right:18, bottom:8, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(5)} interval={getTickInterval(chartData.length, 6)} minTickGap={24} tickMargin={8} />
                    <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                    <Tooltip content={<CustomTooltip mode="pct" />} />
                    <ReferenceLine y={0} stroke="#333" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="portPct" stroke="#00d4ff" dot={false} strokeWidth={2} name="Portfolio" />
                    {showBenchmark && <Line type="monotone" dataKey="spxPct" stroke="#7c4dff" dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="SPX" />}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'#333' }}>
                  Upload balance history to view performance chart
                </div>
              )}
              <div style={{ display:'flex', gap:'16px', marginTop:'8px' }}>
                <label style={{ color:'#555', fontSize:'10px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
                  <input type="checkbox" checked={showBenchmark} onChange={e => setShowBenchmark(e.target.checked)} style={{ accentColor:'#7c4dff' }} />
                  Show SPX Benchmark
                </label>
              </div>
            </div>

            <div style={{ ...S.col, gap:'8px' }}>
              <div style={S.card}>
                <div style={S.cardTitle}>TOTAL PORTFOLIO</div>
                <div style={{ fontSize:'22px', fontWeight:700, color:'#00d4ff' }}>{fmt$(totalPortfolioValue)}</div>
                <div style={{ fontSize:'10px', color:'#555', marginTop:'4px' }}>{accountSummary.length} accounts</div>
              </div>
              {accountSummary.slice(0,4).map(acc => (
                <div key={acc.name} style={{ ...S.card, cursor:'pointer', borderColor: selectedAccount===acc.name ? '#00d4ff' : '#1a1a2e' }}
                  onClick={() => setSelectedAccount(acc.name)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ color: acc.color, fontSize:'11px', fontWeight:700 }}>...{acc.name.split('...')[1]}</div>
                    <div style={{ color: acc.today >= 0 ? '#00e676' : '#ff4444', fontSize:'11px' }}>{fmtPct(acc.today)}</div>
                  </div>
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#e0e0e0', marginTop:'2px' }}>{fmt$(acc.total)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* All accounts table */}
          <div style={S.card}>
            <div style={S.cardTitle}>ALL ACCOUNTS — SNAPSHOT</div>
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>{['Account','NAV','Day Chg','Total Return','Positions','Cost Basis','Unrealized G/L'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {accountSummary.map((acc, i) => {
                    const unrealized = acc.total - acc.cost;
                    return (
                      <tr key={acc.name} style={{ cursor:'pointer' }} onClick={() => setSelectedAccount(acc.name)}>
                        <td style={{ ...S.td }}><span style={{ color: acc.color }}>⬡</span> {acc.name.replace('Limit_Liability_Company ','LLC ').replace('Individual ','Indiv ')}</td>
                        <td style={{ ...S.td, fontWeight:700 }}>{fmt$(acc.total)}</td>
                        <td style={{ ...S.td, color: acc.today >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(acc.today)}</td>
                        <td style={{ ...S.td, color: acc.totalReturn >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(acc.totalReturn)}</td>
                        <td style={S.td}>{acc.posCount}</td>
                        <td style={S.td}>{fmt$(acc.cost)}</td>
                        <td style={{ ...S.td, color: unrealized >= 0 ? '#00e676' : '#ff4444' }}>{fmt$(unrealized)} {acc.cost > 0 ? `(${fmtPct((unrealized/acc.cost)*100)})` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════ PERFORMANCE TAB ══════ */}
      {tab === 'performance' && (
        <div style={S.section}>
          <div style={{ display:'flex', gap:'8px', marginBottom:'16px', alignItems:'center' }}>
            <span style={{ color:'#444', fontSize:'10px' }}>TIMEFRAME:</span>
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                style={{ ...S.btn, ...(timeframe===tf ? S.btnActive : {}) }}>{tf}</button>
            ))}
          </div>

          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'12px' }}>
              <div>
                <div style={S.cardTitle}>CHART SERIES</div>
                <div style={{ color:'#666', fontSize:'11px' }}>
                  Add or remove accounts from the normalized performance chart independently from the dashboard account filter.
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <button type="button" onClick={() => setAllPerformanceAccounts(true)} style={{ ...S.btn, padding:'4px 10px', fontSize:'10px' }}>All Accounts</button>
                <button type="button" onClick={() => setAllPerformanceAccounts(false)} style={{ ...S.btn, padding:'4px 10px', fontSize:'10px' }}>Clear Accounts</button>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button
                type="button"
                onClick={togglePerformanceAggregate}
                style={{ ...S.btn, ...(performanceChartSelection.aggregate ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px', borderColor:'#00d4ff', color:'#00d4ff' }}
              >
                Aggregate
              </button>
              <button
                type="button"
                onClick={togglePerformanceSPX}
                style={{ ...S.btn, ...(performanceChartSelection.spx ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px', borderColor:'#7c4dff', color:'#c3a6ff' }}
              >
                SPX
              </button>
              {accountList.map((accountName) => (
                <button
                  key={accountName}
                  type="button"
                  onClick={() => togglePerformanceAccount(accountName)}
                  style={{
                    ...S.btn,
                    ...(performanceChartSelection.accounts?.[accountName] ? S.btnActive : {}),
                    padding:'4px 10px',
                    fontSize:'10px',
                    borderColor: accountColorMap[accountName] || '#1a1a2e',
                    color: performanceChartSelection.accounts?.[accountName] ? accountColorMap[accountName] || '#e0e0e0' : '#666',
                  }}
                >
                  {accountName.split('...')[1] ? `...${accountName.split('...')[1]}` : accountName}
                </button>
              ))}
            </div>
          </div>

          {/* Full chart */}
          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={S.cardTitle}>NORMALIZED PERFORMANCE COMPARISON · {timeframe}</div>
              {performanceSeriesSummary.length > 0 && (
                <div style={{ display:'flex', gap:'14px', fontSize:'11px', flexWrap:'wrap', justifyContent:'flex-end' }}>
                  {performanceSeriesSummary.map((series) => (
                    <span key={series.key} style={{ color: series.color }}>
                      {series.label === 'Aggregate Portfolio' ? 'Aggregate' : series.label === 'SPX' ? 'SPX' : series.label.split('...')[1] ? `...${series.label.split('...')[1]}` : series.label}
                      : <strong>{fmtPct(series.periodReturn)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {performanceComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={372}>
                <LineChart data={performanceComparisonData} margin={{ top:10, right:22, bottom:8, left:10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                  <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(performanceComparisonData.length)} minTickGap={24} tickMargin={8} />
                  <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="pct" />} />
                  <Legend wrapperStyle={{ fontSize:'11px', color:'#888', paddingTop:'6px' }} />
                  <ReferenceLine y={0} stroke="#333" />
                  {performanceSeriesDefinitions.map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stroke={series.color}
                      dot={false}
                      strokeWidth={series.strokeWidth}
                      strokeDasharray={series.strokeDasharray}
                      name={series.label === 'Aggregate Portfolio' ? 'Aggregate Portfolio' : series.label === 'SPX' ? 'SPX' : series.label.replace('Limit_Liability_Company ', 'LLC ').replace('Individual ', 'Indiv ')}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:360, display:'flex', alignItems:'center', justifyContent:'center', color:'#333' }}>
                Select at least one account, aggregate portfolio, or SPX to chart performance.
              </div>
            )}
          </div>

          {/* Stats grid */}
          {stats && (
            <div style={{ ...S.grid(4), marginBottom:'16px' }}>
              {[
                ['Period Return', fmtPct(stats.total), stats.total >= 0 ? '#00e676' : '#ff4444'],
                ['YTD Return', fmtPct(stats.ytd), stats.ytd >= 0 ? '#00e676' : '#ff4444'],
                ['Max Drawdown', fmtPct(-stats.maxDrawdown), '#ff9800'],
                ['Annualized Vol', `${fmtNum(stats.volatility)}%`, '#e0e0e0'],
                ['Sharpe Ratio', fmtNum(stats.sharpe), stats.sharpe >= 1 ? '#00e676' : '#ffd600'],
                ['Calmar Ratio', fmtNum(stats.calmar), stats.calmar >= 1 ? '#00e676' : '#ffd600'],
                ['Current NAV', fmt$(stats.currentNav), '#00d4ff'],
                ['Data Points', filteredHistory.length.toString(), '#555'],
              ].map(([label, val, color]) => (
                <div key={label} style={signalPanelStyle(color || '#8f99a3')}>
                  <div style={S.cardTitle}>{label}</div>
                  <div style={{ fontSize:'18px', fontWeight:700, color }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* NAV chart (absolute) */}
          <div style={S.card}>
            <div style={S.cardTitle}>ABSOLUTE NAV — {selectedAccount === 'ALL' ? 'Aggregate Portfolio' : selectedAccount}</div>
            <ResponsiveContainer width="100%" height={214}>
              <AreaChart data={filteredHistory.map(([d,v]) => ({ date:d, nav:v }))} margin={{ top:10, right:18, bottom:8, left:12 }}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(filteredHistory.length)} minTickGap={24} tickMargin={8} />
                <YAxis width={76} tick={CHART_TICK_STYLE} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tickMargin={8} />
                <Tooltip content={<CustomTooltip mode="$" />} />
                <Area type="monotone" dataKey="nav" stroke="#00d4ff" fill="url(#navGrad)" strokeWidth={2} dot={false} name="NAV" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════ POSITIONS TAB ══════ */}
      {tab === 'positions' && (
        <div style={S.section}>
          <div style={{ marginBottom:'12px', color:'#555', fontSize:'11px' }}>
            {topPositions.length} positions · {selectedAccount === 'ALL' ? 'All Accounts' : selectedAccount}
          </div>
          <div style={S.card}>
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>{['Symbol','Description','Account','Type','Sector Assignment','Qty','Price','Market Value','Cost Basis','Gain $','Gain %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {topPositions.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight:700, color: p.assetType?.includes('Option') ? '#ffd600' : '#00d4ff' }}>{p.symbol}</td>
                      <td style={{ ...S.td, maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.description || (p.assetType?.includes('Option') ? p.symbol : '--')}</td>
                      <td style={S.td}>{p.account?.split('...')[1] ? `...${p.account.split('...')[1]}` : p.account}</td>
                      <td style={S.td}><span style={S.badge(p.assetType?.includes('Option') ? '#ffd600' : p.assetType?.includes('ETF') ? '#7c4dff' : '#00d4ff')}>{p.assetType?.includes('Option') ? 'OPT' : p.assetType?.includes('ETF') ? 'ETF' : 'EQ'}</span></td>
                      <td style={S.td}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px', minWidth:'180px' }}>
                          <div><span style={{ color: SECTOR_COLORS[p.sector] || '#666' }}>●</span> {p.sector}</div>
                          <select
                            value={
                              sectorOverrides[getSectorOverrideKey(p.account, p.overrideSymbol || p.symbol)]
                              || sectorOverrides[getSectorOverrideKey(p.account, p.symbol)]
                              || sectorOverrides[getSectorOverrideKey(p.account, p.normalizedSymbol)]
                              || sectorOverrides[getSectorOverrideKey(p.account, p.baseSymbol)]
                              || SECTOR_OVERRIDE_AUTO
                            }
                            onChange={(e) => updatePositionSectorOverride(
                              p.account,
                              [p.overrideSymbol || p.symbol, p.symbol, p.normalizedSymbol, p.baseSymbol],
                              e.target.value,
                            )}
                            style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'160px' }}
                          >
                            <option value={SECTOR_OVERRIDE_AUTO}>Auto ({p.mainSector || UNCLASSIFIED_SECTOR})</option>
                            {ALL_SECTORS.map((sector) => (
                              <option key={sector.name} value={sector.name}>{sector.name}</option>
                            ))}
                            <option value={UNCLASSIFIED_SECTOR}>{UNCLASSIFIED_SECTOR}</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ ...S.td, color: p.qty < 0 ? '#ff4444' : '#e0e0e0' }}>{p.qty < 0 ? p.qty.toLocaleString() : p.qty.toLocaleString()}</td>
                      <td style={S.td}>{p.price ? `$${p.price.toFixed(2)}` : '--'}</td>
                      <td style={{ ...S.td, fontWeight:600 }}>{fmt$(p.mktVal)}</td>
                      <td style={S.td}>{fmt$(p.costBasis)}</td>
                      <td style={{ ...S.td, color: (p.mktVal - p.costBasis) >= 0 ? '#00e676' : '#ff4444' }}>{fmt$(p.mktVal - p.costBasis)}</td>
                      <td style={{ ...S.td, color: p.gainPct >= 0 ? '#00e676' : '#ff4444', fontWeight:600 }}>{fmtPct(p.gainPct)}</td>
                    </tr>
                  ))}
                  {topPositions.length === 0 && (
                    <tr><td colSpan={11} style={{ ...S.td, textAlign:'center', color:'#333', padding:'32px' }}>Upload a positions file to view holdings</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════ SECTORS TAB ══════ */}
      {tab === 'sectors' && (
        <div style={S.section}>
          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <div>
                <div style={S.cardTitle}>SECTOR MODEL — BENCHMARK SECTORS PLUS MANUAL DESK BUCKETS</div>
                <div style={{ color:'#666', fontSize:'11px', lineHeight:'1.5' }}>
                  S&P 500 sectors use their sector ETF benchmark. Manual-only buckets (`Crypto`, `Commodities`, `Equities`) are assigned per position and fall back to SPX for charting.
                  Sector targets are account-specific; select an individual account to edit benchmark and target weights.
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                {TIMEFRAMES.map(tf => (
                  <button key={tf} onClick={() => setSectorTimeframe(tf)}
                    style={{ ...S.btn, ...(sectorTimeframe===tf ? S.btnActive : {}), padding:'3px 8px', fontSize:'10px' }}>{tf}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...S.grid(4), marginBottom:'16px' }}>
            {[
              ['Benchmark Wt', fmtPct(sectorTotals.benchmark), '#7c4dff', 'Editable baseline'],
              ['Target Wt', fmtPct(sectorTotals.target), Math.abs(sectorTotals.target - 100) < 0.25 ? '#00d4ff' : '#ffd166', editableSectorScope ? `Configured weights for ${selectedAccount.split('...')[1] ? `...${selectedAccount.split('...')[1]}` : selectedAccount}` : 'Weighted aggregate of account-specific targets'],
              ['Active Sector Wt', fmtPct(sectorTotals.actual), '#00d4ff', 'Current classified exposure'],
              ['Benchmark Return', fmtPct(sectorTotals.benchmarkReturn), sectorTotals.benchmarkReturn >= 0 ? '#00e676' : '#ff4444', `Sector benchmark aggregate for ${sectorTimeframe}`],
            ].map(([label, value, color, sub]) => (
              <div key={label} style={signalPanelStyle(color || '#8f99a3')}>
                <div style={S.cardTitle}>{label}</div>
                <div style={{ fontSize:'19px', fontWeight:700, color }}>{value}</div>
                <div style={{ fontSize:'10px', color:'#444', marginTop:'2px' }}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))', gap:'16px', marginBottom:'16px' }}>
            <div style={S.card}>
              <div style={S.cardTitle}>SECTOR WEIGHTS — ACTIVE vs TARGET</div>
              <ResponsiveContainer width="100%" height={sectorChartHeight}>
                <BarChart data={sectorChartBars} layout="vertical" margin={{ top:10, right:26, bottom:8, left:8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#111" horizontal={false} />
                  <XAxis type="number" tick={CHART_TICK_STYLE} tickFormatter={v => `${v.toFixed(1)}%`} tickMargin={8} />
                  <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={sectorAxisWidth} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="pct" />} />
                  <Bar dataKey="activeWeight" name="Active Weight" fill="#00d4ff" radius={[0,1,1,0]} />
                  <Bar dataKey="targetWeight" name="Target Weight" fill="#7c4dff" radius={[0,1,1,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px', gap:'12px', flexWrap:'wrap' }}>
                <div>
                  <div style={S.cardTitle}>SECTOR SLEEVE RETURN vs BENCHMARK — {selectedSector}</div>
                  {sectorDetail && (
                    <div style={{ fontSize:'11px', color:'#666' }}>
                      {sectorDetail.benchmarkSymbol} · Sector Return {fmtPct(sectorDetail.sectorReturn)} · Benchmark {fmtPct(sectorDetail.benchmarkReturn)} · Active {fmtPct(sectorDetail.activeWeight)} · Vs Bench {fmtPct(sectorDetail.relativeWeight)}
                    </div>
                  )}
                </div>
                {sectorDetail && (
                  <div style={{ display:'flex', gap:'10px', fontSize:'10px', color:'#666', flexWrap:'wrap' }}>
                    <span style={{ color:'#00d4ff' }}>Open {fmt$(sectorDetail.openDollarReturn)} · Closed {fmt$(sectorDetail.closedDollarReturn)}</span>
                    <span style={{ color: sectorDetail.actualAllocationAlpha >= 0 ? '#00e676' : '#ff4444' }}>Decision Alpha {fmtPct(sectorDetail.actualAllocationAlpha)}</span>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'12px' }}>
                {sectorAttribution.map((sector) => (
                  <button
                    key={sector.name}
                    onClick={() => setSelectedSector(sector.name)}
                    style={{
                      ...S.btn,
                      padding:'4px 8px',
                      fontSize:'10px',
                      borderColor: selectedSector === sector.name ? (sector.color || '#00d4ff') : S.btn.borderColor,
                      color: selectedSector === sector.name ? '#f5f7fa' : '#8f99a3',
                      background: selectedSector === sector.name ? `linear-gradient(180deg, ${hexToRgba(sector.color || '#00d4ff', 0.18)}, rgba(8,10,12,0.95))` : S.btn.background,
                    }}
                  >
                    {sector.name}
                  </button>
                ))}
              </div>
              {sectorComparisonChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={sectorComparisonChart} margin={{ top:10, right:20, bottom:8, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                    <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(sectorComparisonChart.length)} minTickGap={24} tickMargin={8} />
                    <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                    <Tooltip content={<CustomTooltip mode="pct" />} />
                    <ReferenceLine y={0} stroke="#333" />
                    <Line type="monotone" dataKey="portfolioPct" stroke="#00d4ff" dot={false} strokeWidth={2} name={`${selectedSector} Sleeve`} connectNulls />
                    {showBenchmark && (
                      <Line
                        type="monotone"
                        dataKey="benchmarkPct"
                        stroke={sectorDetail?.color || '#7c4dff'}
                        dot={false}
                        strokeWidth={1.6}
                        strokeDasharray="5 3"
                        name={`${sectorDetail?.benchmarkSymbol || 'SPX'} Benchmark`}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:320, display:'flex', alignItems:'center', justifyContent:'center', color:'#333' }}>
                  {securityHistoryLoading ? 'Security history is still loading for the selected sleeve.' : 'Benchmark and sleeve history are still loading for the selected sector.'}
                </div>
              )}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'16px', marginBottom:'16px' }}>
            <div style={S.card}>
              <div style={S.cardTitle}>SECTOR DECISION ALPHA — SLEEVE vs BENCHMARK</div>
              <ResponsiveContainer width="100%" height={sectorChartHeight}>
                <BarChart data={sectorChartBars} layout="vertical" margin={{ top:10, right:26, bottom:8, left:8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#111" horizontal={false} />
                  <XAxis type="number" tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                  <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={sectorAxisWidth} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="pct" />} />
                  <ReferenceLine x={0} stroke="#333" />
                  <Bar dataKey="actualAllocationAlphaDisplay" name="Decision Alpha" radius={[0,1,1,0]}>
                    {sectorChartBars.map((s, i) => (
                      <Cell
                        key={i}
                        fill={!Number.isFinite(s.actualAllocationAlpha) ? '#555' : s.actualAllocationAlpha >= 0 ? '#00e676' : '#ff4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>SELECTED SECTOR SLEEVE — {selectedSector}</div>
              {sectorDetail ? (
                <div style={{ ...S.grid(2), gap:'10px' }}>
                  <div style={{ background:'#111', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'2px', padding:'12px' }}>
                    <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>TARGET SPLIT</div>
                    <div style={{ color:'#7c4dff', fontSize:'18px', fontWeight:700 }}>{fmtPct(sectorDetail.targetWeight)}</div>
                    <div style={{ color:'#777', fontSize:'11px', marginTop:'4px' }}>ETF {fmtPct(sectorDetail.targetEtfWeight)} · Alpha {fmtPct(sectorDetail.targetAlphaWeight)}</div>
                    {editableSectorScope && (
                      <div style={{ display:'flex', gap:'8px', marginTop:'10px', flexWrap:'wrap' }}>
                        <label style={{ display:'flex', flexDirection:'column', gap:'4px', color:'#666', fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                          Benchmark
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={resolvedSectorTargets[sectorDetail.name]?.benchmarkWeight ?? 0}
                            onChange={(e) => updateSectorBenchmarkWeight(sectorDetail.name, parseFloat(e.target.value || '0') || 0)}
                            style={{ ...S.input, minWidth:'82px', padding:'4px 6px', fontSize:'10px' }}
                          />
                        </label>
                        <label style={{ display:'flex', flexDirection:'column', gap:'4px', color:'#666', fontSize:'9px', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                          Target
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={resolvedSectorTargets[sectorDetail.name]?.targetWeight ?? 0}
                            onChange={(e) => updateSectorTargetWeight(sectorDetail.name, parseFloat(e.target.value || '0') || 0)}
                            style={{ ...S.input, minWidth:'82px', padding:'4px 6px', fontSize:'10px' }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <div style={{ background:'#111', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'2px', padding:'12px' }}>
                    <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>ACTUAL SPLIT</div>
                    <div style={{ color:'#00d4ff', fontSize:'18px', fontWeight:700 }}>{fmtPct(sectorDetail.actualWeight)}</div>
                    <div style={{ color:'#777', fontSize:'11px', marginTop:'4px' }}>ETF {fmtPct(sectorDetail.actualEtfWeight)} · Alpha {fmtPct(sectorDetail.actualAlphaWeight)}</div>
                  </div>
                  <div style={{ background:'#111', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'2px', padding:'12px' }}>
                    <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>LIVE ACTIVE WT</div>
                    <div style={{ color:'#00d4ff', fontSize:'18px', fontWeight:700 }}>{fmtPct(sectorDetail.activeWeight)}</div>
                    <div style={{ color:'#777', fontSize:'11px', marginTop:'4px' }}>Active = % of total account in sector · Vs benchmark {fmtPct(sectorDetail.relativeWeight)}</div>
                  </div>
                  <div style={{ background:'#111', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'2px', padding:'12px' }}>
                    <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>SECTOR RETURN</div>
                    <div style={{ color: sectorDetail.sectorReturn >= 0 ? '#00e676' : '#ff4444', fontSize:'18px', fontWeight:700 }}>{fmtPct(sectorDetail.sectorReturn)}</div>
                    <div style={{ color:'#777', fontSize:'11px', marginTop:'4px' }}>{sectorDetail.sectorReturnBaseLabel} base for {sectorTimeframe} · Base {fmt$(sectorDetail.sectorReturnBase)} · Reconstructed sleeve {fmtPct(sectorDetail.portfolioRelativeReturn)} · Benchmark {sectorDetail.benchmarkSymbol} {fmtPct(sectorDetail.benchmarkReturn)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ color:'#333', padding:'30px 0', textAlign:'center' }}>Upload positions to populate sector sleeves.</div>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardTitle}>SECTOR DETAIL — CLICK A ROW TO DRILL INTO ITS RETURN SERIES</div>
            {!editableSectorScope && (
              <div style={{ color:'#8b9097', fontSize:'10px', marginBottom:'10px' }}>
                Select a single account to edit benchmark and target weights. `ALL` shows a weighted blend of account-specific settings.
              </div>
            )}
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>{['Sector','Benchmark','Sector Ret %','Bench %','Active Wt','Benchmark Wt','Vs Bench','Target Wt','ETF / Alpha','Target 70/30','Wtd Bench','Wtd Active','Target α','Decision α','Benchmark Input','Target Input','Target Bias','Positions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sectorAttribution.map(s => (
                    <tr key={s.name}
                      onClick={() => setSelectedSector(s.name)}
                      style={{ cursor:'pointer', background: selectedSector === s.name ? 'rgba(0,212,255,0.05)' : 'transparent' }}>
                      <td style={S.td}><span style={{ color: SECTOR_COLORS[s.name] || '#666', marginRight:'6px' }}>■</span>{s.name}</td>
                      <td style={{ ...S.td, color:'#666' }}>{s.benchmarkSymbol}</td>
                      <td style={{ ...S.td, color: s.sectorReturn >= 0 ? '#00e676' : '#ff4444', fontWeight:600 }}>{fmtPct(s.sectorReturn)}</td>
                      <td style={{ ...S.td, color: s.benchmarkReturn >= 0 ? '#00e676' : '#ff4444', fontWeight:600 }}>{fmtPct(s.benchmarkReturn)}</td>
                      <td style={{ ...S.td, fontWeight:700 }}>{fmtPct(s.activeWeight)}</td>
                      <td style={S.td}>{fmtPct(s.benchmarkWeight)}</td>
                      <td style={{ ...S.td, color: s.relativeWeight >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(s.relativeWeight)}</td>
                      <td style={S.td}>{fmtPct(s.targetWeight)}</td>
                      <td style={S.td}>A: {fmtPct(s.actualEtfWeight)} / {fmtPct(s.actualAlphaWeight)}</td>
                      <td style={S.td}>T: {fmtPct(s.targetEtfWeight)} / {fmtPct(s.targetAlphaWeight)}</td>
                      <td style={{ ...S.td, color: s.weightedBenchmarkReturn >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(s.weightedBenchmarkReturn)}</td>
                      <td style={{ ...S.td, color: s.weightedActualReturn >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(s.weightedActualReturn)}</td>
                      <td style={{ ...S.td, color: s.targetAllocationAlpha >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(s.targetAllocationAlpha)}</td>
                      <td style={{ ...S.td, color: s.actualAllocationAlpha >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(s.actualAllocationAlpha)}</td>
                      <td style={S.td}>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={resolvedSectorTargets[s.name]?.benchmarkWeight ?? 0}
                          disabled={!editableSectorScope}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateSectorBenchmarkWeight(s.name, parseFloat(e.target.value || '0') || 0)}
                          style={{ ...S.input, minWidth:'76px', padding:'4px 6px', fontSize:'10px', opacity: editableSectorScope ? 1 : 0.55 }}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={resolvedSectorTargets[s.name]?.targetWeight ?? 0}
                          disabled={!editableSectorScope}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateSectorTargetWeight(s.name, parseFloat(e.target.value || '0') || 0)}
                          style={{ ...S.input, minWidth:'76px', padding:'4px 6px', fontSize:'10px', opacity: editableSectorScope ? 1 : 0.55 }}
                        />
                      </td>
                      <td style={S.td}>
                        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', opacity: editableSectorScope ? 1 : 0.5 }}>
                          <button type="button" onClick={e => { e.stopPropagation(); setSectorAllocationBias(s.name, 'underweight'); }}
                            disabled={!editableSectorScope}
                            style={{ ...S.btn, padding:'3px 6px', fontSize:'9px', ...(s.stance === 'Underweight' ? { borderColor:'#ff4444', color:'#ff4444' } : {}) }}>UW</button>
                          <button type="button" onClick={e => { e.stopPropagation(); setSectorAllocationBias(s.name, 'equal'); }}
                            disabled={!editableSectorScope}
                            style={{ ...S.btn, padding:'3px 6px', fontSize:'9px', ...(s.stance === 'Equal' ? S.btnActive : {}) }}>EQ</button>
                          <button type="button" onClick={e => { e.stopPropagation(); setSectorAllocationBias(s.name, 'overweight'); }}
                            disabled={!editableSectorScope}
                            style={{ ...S.btn, padding:'3px 6px', fontSize:'9px', ...(s.stance === 'Overweight' ? { borderColor:'#00e676', color:'#00e676' } : {}) }}>OW</button>
                          <button type="button" onClick={e => { e.stopPropagation(); nudgeSectorActiveWeight(s.name, -0.5); }}
                            disabled={!editableSectorScope}
                            style={{ ...S.btn, padding:'3px 6px', fontSize:'9px' }}>-0.5</button>
                          <button type="button" onClick={e => { e.stopPropagation(); nudgeSectorActiveWeight(s.name, 0.5); }}
                            disabled={!editableSectorScope}
                            style={{ ...S.btn, padding:'3px 6px', fontSize:'9px' }}>+0.5</button>
                        </div>
                      </td>
                      <td style={S.td}>{s.positions.length}</td>
                    </tr>
                  ))}
                  {sectorAttribution.length === 0 && <tr><td colSpan={18} style={{ ...S.td, textAlign:'center', color:'#333', padding:'32px' }}>Upload positions file to view sector breakdown</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════ REALIZED P&L TAB ══════ */}
      {tab === 'realized' && (
        <div style={S.section}>
          <div style={{ ...S.card, marginBottom:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <div>
                <div style={S.cardTitle}>REALIZED P&amp;L WINDOW</div>
                <div style={{ color:'#666', fontSize:'11px', lineHeight:'1.5' }}>
                  Closed trades are filtered by closed date for the selected account scope.
                  {filteredRealizedTrades.length
                    ? ` Window ${realizedDateBounds.startDate || 'inception'} to ${realizedDateBounds.endDate || 'today'} · ${filteredRealizedTrades.length} trades`
                    : selectedRealizedTrades.length
                      ? ` No closed trades in ${realizedTimeframe}`
                      : ' Upload realized gain/loss data to populate this view.'}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setRealizedTimeframe(tf)}
                    style={{ ...S.btn, ...(realizedTimeframe===tf ? S.btnActive : {}), padding:'3px 8px', fontSize:'10px' }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          {filteredRealizedTrades.length > 0 && (() => {
            const totalGain = filteredRealizedTrades.reduce((a,t) => a+t.gain, 0);
            const winners = filteredRealizedTrades.filter(t => t.gain > 0);
            const losers = filteredRealizedTrades.filter(t => t.gain < 0);
            const winRate = (winners.length / filteredRealizedTrades.length) * 100;
            const avgWin = winners.length ? winners.reduce((a,t)=>a+t.gain,0)/winners.length : 0;
            const avgLoss = losers.length ? losers.reduce((a,t)=>a+t.gain,0)/losers.length : 0;
            const pf = Math.abs(avgLoss) > 0 ? Math.abs(avgWin / avgLoss) : 0;
            return (
              <div style={{ ...S.grid(5), marginBottom:'16px' }}>
                {[
                  ['Total Realized G/L', fmt$(totalGain), totalGain >= 0 ? '#00e676' : '#ff4444'],
                  ['Win Rate', fmtPct(winRate), winRate >= 50 ? '#00e676' : '#ff4444'],
                  ['Avg Winner', fmt$(avgWin), '#00e676'],
                  ['Avg Loser', fmt$(avgLoss), '#ff4444'],
                  ['Profit Factor', fmtNum(pf), pf >= 1 ? '#00e676' : '#ff4444'],
                ].map(([label, val, color]) => (
                  <div key={label} style={signalPanelStyle(color || '#8f99a3')}><div style={S.cardTitle}>{label}</div><div style={{ fontSize:'18px', fontWeight:700, color }}>{val}</div></div>
                ))}
              </div>
            );
          })()}

          {/* Realized by sector */}
          {realizedBySector.length > 0 && (
            <div style={{ ...S.card, marginBottom:'16px' }}>
              <div style={S.cardTitle}>REALIZED P&L BY SECTOR</div>
              <ResponsiveContainer width="100%" height={realizedSectorChartHeight}>
                <BarChart data={realizedBySector} layout="vertical" margin={{ top:10, right:26, bottom:8, left:8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#111" horizontal={false} />
                  <XAxis type="number" tick={CHART_TICK_STYLE} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tickMargin={8} />
                  <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={realizedSectorAxisWidth} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="$" />} />
                  <ReferenceLine x={0} stroke="#333" />
                  <Bar dataKey="gain" name="Realized G/L" radius={[0,1,1,0]}>
                    {realizedBySector.map((s, i) => <Cell key={i} fill={s.gain >= 0 ? '#00e676' : '#ff4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trades table */}
          <div style={S.card}>
            <div style={S.cardTitle}>REALIZED TRADES — {filteredRealizedTrades.length} ROWS · {realizedTimeframe}</div>
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>{['Symbol','Account','Type','Sector Assignment','Closed Date','Qty','Proceeds','Cost','Gain $','Gain %','Term'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredRealizedTrades.slice(0, 100).map((t, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight:700, color: t.isOption ? '#ffd600' : '#00d4ff' }}>{t.symbol.length > 30 ? t.symbol.slice(0,28)+'…' : t.symbol}</td>
                      <td style={{ ...S.td, fontSize:'10px', color:'#666' }}>{t.account.split('...')[1]}</td>
                      <td style={S.td}><span style={S.badge(t.isOption ? '#ffd600' : '#00d4ff')}>{t.isOption ? 'OPT' : 'EQ'}</span></td>
                      <td style={S.td}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px', minWidth:'180px' }}>
                          <div><span style={{ color: SECTOR_COLORS[t.sector] || '#666' }}>●</span> {t.sector}</div>
                          <select
                            value={t.tradeSectorOverride || SECTOR_OVERRIDE_AUTO}
                            onChange={(e) => updateRealizedTradeSectorOverride(t, e.target.value)}
                            style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'160px' }}
                          >
                            <option value={SECTOR_OVERRIDE_AUTO}>Auto ({t.mainSector || UNCLASSIFIED_SECTOR})</option>
                            {ALL_SECTORS.map((sector) => (
                              <option key={sector.name} value={sector.name}>{sector.name}</option>
                            ))}
                            <option value={UNCLASSIFIED_SECTOR}>{UNCLASSIFIED_SECTOR}</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ ...S.td, color:'#666' }}>{t.closedDate}</td>
                      <td style={S.td}>{t.qty}</td>
                      <td style={S.td}>{fmt$(t.proceeds)}</td>
                      <td style={S.td}>{fmt$(t.cost)}</td>
                      <td style={{ ...S.td, color: t.gain >= 0 ? '#00e676' : '#ff4444', fontWeight:600 }}>{fmt$(t.gain)}</td>
                      <td style={{ ...S.td, color: t.gain >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(t.gainPct)}</td>
                      <td style={S.td}><span style={S.badge(t.term === 'Long Term' ? '#00e676' : '#ffd600')}>{t.term === 'Long Term' ? 'LT' : 'ST'}</span></td>
                    </tr>
                  ))}
                  {filteredRealizedTrades.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ ...S.td, textAlign:'center', color:'#333', padding:'32px' }}>
                        {selectedRealizedTrades.length
                          ? `No realized trades found for ${realizedTimeframe}.`
                          : 'Upload realized gain/loss file to view trades.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filteredRealizedTrades.length > 100 && <div style={{ padding:'8px 12px', color:'#444', fontSize:'10px' }}>Showing 100 of {filteredRealizedTrades.length} trades</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══════ RISK TAB ══════ */}
      {tab === 'risk' && (
        <div style={S.section}>
          {allTimeStats ? (
            <>
              <div style={{ ...S.grid(3), marginBottom:'16px' }}>
                {/* Risk card set */}
                {[
                  { label:'Max Drawdown', val: fmtPct(-allTimeStats.maxDrawdown), color:'#ff9800', desc:'Peak-to-trough decline' },
                  { label:'Annualized Volatility', val: `${fmtNum(allTimeStats.volatility)}%`, color:'#e0e0e0', desc:'σ of daily returns × √252' },
                  { label:'Sharpe Ratio', val: fmtNum(allTimeStats.sharpe), color: allTimeStats.sharpe >= 1 ? '#00e676' : allTimeStats.sharpe >= 0 ? '#ffd600' : '#ff4444', desc:'Return per unit risk (4.3% RF)' },
                  { label:'Calmar Ratio', val: fmtNum(allTimeStats.calmar), color: allTimeStats.calmar >= 0.5 ? '#00e676' : '#ffd600', desc:'Ann. return / Max drawdown' },
                  { label:'Total Return', val: fmtPct(allTimeStats.total), color: allTimeStats.total >= 0 ? '#00e676' : '#ff4444', desc:'Inception to date' },
                  { label:'YTD Return', val: fmtPct(allTimeStats.ytd), color: allTimeStats.ytd >= 0 ? '#00e676' : '#ff4444', desc:'Year to date' },
                ].map(({ label, val, color, desc }) => (
                  <div key={label} style={signalPanelStyle(color || '#8f99a3')}>
                    <div style={S.cardTitle}>{label}</div>
                    <div style={{ fontSize:'24px', fontWeight:700, color, marginBottom:'4px' }}>{val}</div>
                    <div style={{ fontSize:'10px', color:'#444' }}>{desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...S.card, marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'12px', marginBottom:'12px', flexWrap:'wrap' }}>
                  <div>
                    <div style={S.cardTitle}>CORRELATION MATRIX</div>
                    <div style={{ color:'#666', fontSize:'11px', marginTop:'4px', lineHeight:'1.5' }}>
                      {riskMatrixMode === 'positions'
                        ? `Top ${riskCorrelationItems.length} positions by absolute market value with historical series over ${timeframe}. Options and instruments without history are excluded.`
                        : `Sector proxy correlations over ${timeframe}. S&P sectors use sector ETFs and manual sectors fall back to SPX.`}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                    <button
                      type="button"
                      onClick={() => setRiskMatrixMode('sectors')}
                      style={{ ...S.btn, ...(riskMatrixMode === 'sectors' ? S.btnActive : {}) }}
                    >
                      Sectors
                    </button>
                    <button
                      type="button"
                      onClick={() => setRiskMatrixMode('positions')}
                      style={{ ...S.btn, ...(riskMatrixMode === 'positions' ? S.btnActive : {}) }}
                    >
                      Positions
                    </button>
                  </div>
                </div>

                {riskCorrelationItems.length ? (
                  <>
                    <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'12px', color:'#666', fontSize:'10px' }}>
                      <span>{riskCorrelationMeta.itemCount} series</span>
                      <span>{riskCorrelationMeta.minObs}–{riskCorrelationMeta.maxObs} return observations</span>
                      <span style={{ color:'#00e676' }}>Positive = green</span>
                      <span style={{ color:'#ff4444' }}>Negative = red</span>
                    </div>
                    <div style={{ overflow:'auto', border:'1px solid rgba(255,255,255,0.06)' }}>
                      <table style={{ ...S.table, minWidth: `${Math.max(720, riskCorrelationItems.length * 92 + 180)}px` }}>
                        <thead>
                          <tr>
                            <th style={{ ...S.th, position:'sticky', left:0, zIndex:3, background:'#0b0d10', minWidth:'180px' }}>Series</th>
                            {riskCorrelationItems.map((item) => (
                              <th key={item.key} style={{ ...S.th, minWidth:'92px', textAlign:'center' }}>
                                <div style={{ color:item.color || '#d8dce2', fontWeight:700 }}>{item.label}</div>
                                <div style={{ color:'#666', fontSize:'9px', marginTop:'2px' }}>{item.sublabel || item.valueLabel}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {riskCorrelationItems.map((rowItem, rowIndex) => (
                            <tr key={rowItem.key}>
                              <td style={{ ...S.td, position:'sticky', left:0, zIndex:2, background:'#090c0f', minWidth:'180px' }}>
                                <div style={{ color:rowItem.color || '#d8dce2', fontWeight:700 }}>{rowItem.label}</div>
                                <div style={{ color:'#666', fontSize:'10px', marginTop:'2px' }}>{rowItem.sublabel || rowItem.valueLabel}</div>
                              </td>
                              {riskCorrelationMatrix[rowIndex].map((cell, columnIndex) => {
                                const isDiagonal = rowIndex === columnIndex;
                                const value = cell?.value;
                                return (
                                  <td
                                    key={`${rowItem.key}-${riskCorrelationItems[columnIndex].key}`}
                                    title={Number.isFinite(value)
                                      ? `${rowItem.label} vs ${riskCorrelationItems[columnIndex].label}: ${value.toFixed(3)} (${cell.observations} obs)`
                                      : `${rowItem.label} vs ${riskCorrelationItems[columnIndex].label}: insufficient overlap`}
                                    style={{
                                      ...S.td,
                                      minWidth:'92px',
                                      textAlign:'center',
                                      fontWeight:isDiagonal ? 700 : 600,
                                      color:isDiagonal ? '#f4f6f8' : Number.isFinite(value) ? '#d8dce2' : '#666',
                                      background:isDiagonal ? 'rgba(244,178,79,0.18)' : correlationColor(value),
                                      borderColor:isDiagonal ? 'rgba(244,178,79,0.3)' : 'rgba(255,255,255,0.05)',
                                    }}
                                  >
                                    {Number.isFinite(value) ? value.toFixed(2) : '—'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ color:'#555', fontSize:'11px', padding:'24px 0', textAlign:'center' }}>
                    {riskMatrixMode === 'positions'
                      ? 'No position histories are available yet for the selected account and timeframe.'
                      : 'No sector histories are available yet for the selected account and timeframe.'}
                  </div>
                )}
              </div>

              {/* Drawdown chart */}
              {(() => {
                const ddData = [];
                let peak = activeHistory[0]?.[1] || 1;
                for (const [date, val] of activeHistory) {
                  if (val > peak) peak = val;
                  ddData.push({ date, dd: ((val - peak) / peak) * 100 });
                }
                const filtered = filterByTimeframe(ddData.map(d => [d.date, d.dd]), timeframe);
                return (
                  <div style={{ ...S.card, marginBottom:'16px' }}>
                    <div style={S.cardTitle}>DRAWDOWN CHART</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={filtered.map(([d,v]) => ({ date:d, dd:v }))} margin={{ top:10, right:18, bottom:8, left:10 }}>
                        <defs>
                          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ff4444" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                        <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(filtered.length)} minTickGap={24} tickMargin={8} />
                        <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v.toFixed(1)}%`} tickMargin={8} />
                        <Tooltip content={<CustomTooltip mode="pct" />} />
                        <ReferenceLine y={0} stroke="#333" />
                        <Area type="monotone" dataKey="dd" stroke="#ff4444" fill="url(#ddGrad)" strokeWidth={1.5} dot={false} name="Drawdown" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              {/* Rolling 30-day vol */}
              {(() => {
                if (activeHistory.length < 32) return null;
                const rolling = [];
                for (let i = 31; i < activeHistory.length; i++) {
                  const window = activeHistory.slice(i-30, i+1);
                  const rets = window.slice(1).map((_, j) => (window[j+1][1] - window[j][1]) / window[j][1]);
                  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
                  const variance = rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
                  const vol = Math.sqrt(variance * 252) * 100;
                  rolling.push({ date: activeHistory[i][0], vol });
                }
                const filtered = filterByTimeframe(rolling.map(d => [d.date, d.vol]), timeframe);
                return (
                  <div style={S.card}>
                    <div style={S.cardTitle}>ROLLING 30-DAY VOLATILITY (ANNUALIZED)</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={filtered.map(([d,v]) => ({ date:d, vol:v }))} margin={{ top:10, right:18, bottom:8, left:10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                        <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(filtered.length)} minTickGap={24} tickMargin={8} />
                        <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v.toFixed(1)}%`} tickMargin={8} />
                        <Tooltip content={<CustomTooltip mode="pct" />} />
                        <Line type="monotone" dataKey="vol" stroke="#ffd600" dot={false} strokeWidth={2} name="30D Vol" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </>
          ) : (
            <div style={{ ...S.card, textAlign:'center', padding:'48px', color:'#333' }}>
              Upload balance history to compute risk metrics
            </div>
          )}
        </div>
      )}

      {/* ══════ UPLOAD TAB ══════ */}
      {tab === 'upload' && (
        <div style={S.section}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'flex-start', marginBottom:'20px', flexWrap:'wrap' }}>
            <div style={{ color:'#555', fontSize:'11px', lineHeight:'1.6', maxWidth:'780px' }}>
              Upload Schwab export files to update the shared portfolio workspace. Uploaded balances, positions, realized P&amp;L, and sector configuration are saved to the backend so every viewer sees the same portfolio after one daily refresh.
              Files can be re-uploaded at any time to refresh the shared state.
              <div style={{ color: sharedSyncTone, marginTop:'6px', fontWeight:600 }}>
                Workspace sync: {sharedSyncStatus}{sharedStateUpdatedAt ? ` · ${new Date(sharedStateUpdatedAt).toLocaleString()}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={resetAllData}
              style={{ ...S.btn, borderColor:'#ff4444', color:'#ff4444' }}
            >
              Reset All Data
            </button>
          </div>

          <div style={S.grid(3)}>
            {[
              {
                key: 'positions', label: 'POSITIONS FILE', hint: 'All-Accounts-Positions-*.csv',
                desc: 'Export from Schwab: Accounts → All Accounts → Positions → Export. Contains current holdings, prices, and market values for all accounts.',
                handler: handlePositionsUpload, accept: '.csv,.CSV',
                fields: ['Symbol', 'Description', 'Qty', 'Price', 'Market Value', 'Cost Basis', 'Asset Type'],
              },
              {
                key: 'balances', label: 'BALANCE HISTORY FILES', hint: 'Account_XXXX###_Balances_*.CSV',
                desc: 'Export from Schwab: Account → History → Balance History → Export. You can select multiple balance files at once. Used to compute historical performance, NAV chart, and risk metrics.',
                fields: ['Date', 'Amount'],
                handler: handleBalancesUpload, accept: '.csv,.CSV', multiple: true,
              },
              {
                key: 'realized', label: 'REALIZED GAIN/LOSS FILE', hint: 'All_Accounts_GainLoss_*.csv',
                desc: 'Export from Schwab: Accounts → Gain/Loss → Realized → Export All. Used for trade analytics, sector P&L, and win/loss statistics.',
                fields: ['Symbol', 'Closed Date', 'Proceeds', 'Cost Basis', 'Gain/Loss $'],
                handler: handleRealizedUpload, accept: '.csv,.CSV',
              },
            ].map(({ key, label, hint, desc, handler, accept, fields, multiple }) => (
              <UploadCard key={key} label={label} hint={hint} desc={desc} fields={fields}
                status={uploadStatus[key]} handler={handler} accept={accept} multiple={multiple} />
            ))}
          </div>

          {/* Current data status */}
          <div style={{ ...S.card, marginTop:'24px' }}>
            <div style={S.cardTitle}>CURRENT DATA STATUS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginTop:'8px' }}>
              <div>
                <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>POSITIONS</div>
                {Object.entries(accounts).map(([name, acc]) => (
                  <div key={name} style={{ color:'#888', fontSize:'11px', marginBottom:'3px' }}>
                    <span style={{ color:'#00d4ff' }}>...{name.split('...')[1]}</span>: {acc.positions.length} positions · {fmt$(acc.total)}
                  </div>
                ))}
                {Object.keys(accounts).length === 0 && <div style={{ color:'#333' }}>No positions loaded</div>}
              </div>
              <div>
                <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>BALANCE HISTORY</div>
                {Object.entries(balanceHistory).map(([name, hist]) => (
                  <div key={name} style={{ color:'#888', fontSize:'11px', marginBottom:'3px' }}>
                    <span style={{ color:'#00d4ff' }}>...{name.split('...')[1]}</span>: {hist.length} rows · {hist[0]?.[0]} → {hist[hist.length-1]?.[0]}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ color:'#555', fontSize:'10px', marginBottom:'6px' }}>REALIZED TRADES</div>
                <div style={{ color:'#888', fontSize:'11px' }}>{realizedTrades.length} trades · {new Set(realizedTrades.map(t=>t.account)).size} accounts</div>
                {realizedTrades.length > 0 && (
                  <div style={{ color:'#555', fontSize:'10px', marginTop:'4px' }}>
                    Total: {fmt$(realizedTrades.reduce((a,t)=>a+t.gain,0))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Benchmark status */}
          <div style={{ ...S.card, marginTop:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={S.cardTitle}>BENCHMARK MARKET DATA</div>
                <div style={{ fontSize:'11px', color: spxData.length > 0 ? '#00e676' : '#666', marginBottom:'3px' }}>
                  {spxData.length > 0 ? `SPX ✓ ${spxData.length} trading days (${spxData[0]?.[0]} – ${spxData[spxData.length-1]?.[0]})` : spxLoading ? 'Loading benchmark data from Stooq...' : 'SPX not loaded'}
                </div>
                <div style={{ fontSize:'10px', color: Object.keys(sectorBenchmarkData).length === SP500_SECTORS.length ? '#00e676' : '#666' }}>
                  Sector ETFs: {Object.keys(sectorBenchmarkData).length}/{SP500_SECTORS.length} loaded
                </div>
              </div>
              <button style={S.btn} onClick={() => loadBenchmarks({ forceRefresh: true })}>{spxLoading ? 'Loading…' : 'Refresh Benchmarks'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── UPLOAD CARD COMPONENT ────────────────────────────────────────────────────
function UploadCard({ label, hint, desc, fields, status, handler, accept, multiple = false }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const onFile = (fileInput) => {
    if (!fileInput) return;
    if (multiple) {
      const files = Array.isArray(fileInput) ? fileInput : Array.from(fileInput || []);
      if (files.length) handler(files);
      return;
    }
    const file = Array.isArray(fileInput) ? fileInput[0] : fileInput?.[0] || fileInput;
    if (file) handler(file);
  };

  return (
    <div style={{ ...S.card, display:'flex', flexDirection:'column', gap:'12px' }}>
      <div style={{ color:'#f4b24f', fontSize:'11px', fontWeight:700, letterSpacing:'1.4px', textTransform:'uppercase' }}>{label}</div>
      <div style={{ color:'#6e7680', fontSize:'10px', fontFamily:'inherit' }}>{hint}</div>
      <div style={{ color:'#a3acb7', fontSize:'11px', lineHeight:'1.6' }}>{desc}</div>
      {fields && (
        <div style={{ fontSize:'10px', color:'#59616b' }}>
          Expected columns: {fields.map(f => <span key={f} style={{ color:'#aab3bc', background:'linear-gradient(180deg, rgba(38,42,46,0.95), rgba(12,14,17,0.98))', border:'1px solid rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:'2px', margin:'0 2px' }}>{f}</span>)}
        </div>
      )}
      <div
        style={{ ...S.uploadBox, borderColor: dragging ? 'rgba(244,178,79,0.5)' : 'rgba(244,178,79,0.22)', background: dragging ? 'rgba(244,178,79,0.08)' : 'linear-gradient(180deg, rgba(24,27,31,0.48), rgba(7,9,11,0.72))' }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(Array.from(e.dataTransfer.files || [])); }}
        onClick={() => inputRef.current?.click()}
      >
        <div style={{ fontSize:'24px', marginBottom:'8px', opacity:0.6, color:'#f4b24f' }}>⬆</div>
        <div style={{ color:'#a3acb7', fontSize:'11px' }}>{multiple ? 'Drop files here or click to browse' : 'Drop file here or click to browse'}</div>
        <div style={{ color:'#6e7680', fontSize:'10px', marginTop:'4px' }}>CSV · Excel exports</div>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display:'none' }} onChange={e => onFile(Array.from(e.target.files || []))} />
      </div>
      {status && (
        <div style={{ fontSize:'11px', color: status.startsWith('✓') ? '#6ef3a5' : '#ff8f8f', background: status.startsWith('✓') ? 'rgba(0,230,118,0.08)' : 'rgba(255,68,68,0.08)', border:`1px solid ${status.startsWith('✓') ? 'rgba(0,230,118,0.18)' : 'rgba(255,68,68,0.18)'}`, padding:'6px 10px', borderRadius:'3px', fontFamily:'inherit' }}>
          {status}
        </div>
      )}
    </div>
  );
}
