import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart, Bar, Cell } from "recharts";
import { api } from "./services/api";

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
const POSITION_ATTRIBUTION_HELD = "__HELD_ACCOUNT__";
const REALIZED_ATTRIBUTION_FOLLOW_POSITION = "__FOLLOW_POSITION_ATTRIBUTION__";
const FUTURES_STATEMENT_ACCOUNT_AUTO = "__AUTO_FUTURES_ACCOUNT__";
const FUTURES_CLEARING_ACCOUNT = "Futures_Clearing ...FUT";
const DEFAULT_FUTURES_HELD_ACCOUNT_SUFFIX = "145";
const POSITION_SOURCE_STANDARD = "positions_csv";
const POSITION_SOURCE_FUTURES = "futures_statement";

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

const FUTURES_ROOT_TO_SECTOR = {
  "/ES": "Equities",
  "/MES": "Equities",
  "/NQ": "Equities",
  "/MNQ": "Equities",
  "/RTY": "Equities",
  "/M2K": "Equities",
  "/YM": "Equities",
  "/MYM": "Equities",
  "/BTC": "Crypto",
  "/MBT": "Crypto",
  "/ETH": "Crypto",
  "/MET": "Crypto",
  "/GC": "Commodities",
  "/MGC": "Commodities",
  "/SI": "Commodities",
  "/SIL": "Commodities",
  "/HG": "Commodities",
  "/MHG": "Commodities",
  "/CL": "Commodities",
  "/MCL": "Commodities",
  "/NG": "Commodities",
  "/MNG": "Commodities",
  "/RB": "Commodities",
  "/HO": "Commodities",
  "/ZC": "Commodities",
  "/ZS": "Commodities",
  "/ZW": "Commodities",
  "/ZM": "Commodities",
  "/ZL": "Commodities",
  "/KE": "Commodities",
  "/HE": "Commodities",
  "/LE": "Commodities",
  "/GF": "Commodities",
  "/CC": "Commodities",
  "/KC": "Commodities",
  "/CT": "Commodities",
  "/SB": "Commodities",
  "/OJ": "Commodities",
  "/PL": "Commodities",
  "/PA": "Commodities",
};

const SECTOR_COLORS = Object.fromEntries([
  ...ALL_SECTORS.map(({ name, color }) => [name, color]),
  [UNCLASSIFIED_SECTOR, "#666"],
]);

const PALETTE = {
  bg: '#060709',
  bgRaised: '#0f1216',
  bgPanelTop: '#181c21',
  bgPanelBottom: '#0b0d11',
  bgHeader: '#1b1f25',
  bgHeaderShadow: '#12151a',
  border: 'rgba(157, 138, 107, 0.18)',
  borderStrong: 'rgba(216, 139, 47, 0.28)',
  borderSubtle: 'rgba(255, 255, 255, 0.05)',
  accent: '#d88b2f',
  accentBright: '#f0b35b',
  accentMuted: '#b87628',
  text: '#ddd7cc',
  textStrong: '#f3ecdf',
  textMuted: '#9d9588',
  textDim: '#6f685f',
  portfolio: '#ddd6c8',
  benchmark: '#b7772c',
  positive: '#67a86f',
  negative: '#c7695c',
  warning: '#c5a14d',
  info: '#98a5ad',
  steel: '#87949c',
  slate: '#7e8b92',
  moss: '#7b9774',
  rust: '#aa7257',
  plum: '#897f8f',
  brass: '#b49b63',
  lineGrid: 'rgba(108, 101, 91, 0.18)',
};

const ACCOUNT_COLORS = [
  PALETTE.steel,
  PALETTE.accentMuted,
  PALETTE.moss,
  PALETTE.rust,
  PALETTE.plum,
  PALETTE.brass,
  '#70838c',
  '#9b815f',
  '#7d8d84',
  '#9a6554',
  '#756f7f',
  '#8f8a6f',
];
const APP_BUILD_VERSION = "2026.04.02.4";
const APP_STATE_STORAGE_KEY = `portfolio-dashboard.app-state.${APP_BUILD_VERSION}`;
const LEGACY_APP_STATE_STORAGE_KEYS = [
  "portfolio-dashboard.app-state.2026.04.02.1",
  "portfolio-dashboard.app-state.2026.04.01.3",
  "portfolio-dashboard.app-state.2026.04.01.2",
  "portfolio-dashboard.app-state.2026.03.10.2",
];
const MARKET_CACHE_STORAGE_KEY = "portfolio-dashboard.market-cache.v2";
const SECURITY_HISTORY_STORAGE_KEY = "portfolio-dashboard.security-history.v1";
const SHARED_DASHBOARD_STATE_ENDPOINT = "/api/admin/shared-dashboard-state";
const SHARED_DASHBOARD_POLL_MS = 60000;
const SHARED_DASHBOARD_POLL_JITTER_MS = 15000;
const SHARED_DASHBOARD_SAVE_DEBOUNCE_MS = 900;

function todayIsoLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function formatOverrideNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function getLegacyRealizedTradeOverrideKey(trade) {
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

function isFutureLikeRealizedTrade(trade) {
  const assetType = String(trade?.assetType || '').toLowerCase();
  if (assetType.includes('future')) return true;
  return Boolean(FUTURES_ROOT_TO_SECTOR[getFutureRootSymbol(trade?.baseSym || trade?.symbol)]);
}

function getRealizedTradeAssetTypeToken(trade) {
  const assetType = String(trade?.assetType || '').toLowerCase();
  if (assetType.includes('future') && assetType.includes('option')) return 'FUT_OPT';
  if (assetType.includes('future') || trade?.isFuture) return 'FUT';
  if (assetType.includes('option') || trade?.isOption) return 'OPT';
  return 'EQ';
}

function getRealizedTradeBadge(trade) {
  const token = getRealizedTradeAssetTypeToken(trade);
  if (token === 'FUT_OPT') return { label: 'FOP', color: PALETTE.brass };
  if (token === 'FUT') return { label: 'FUT', color: PALETTE.brass };
  if (token === 'OPT') return { label: 'OPT', color: PALETTE.warning };
  return { label: 'EQ', color: PALETTE.info };
}

function getRealizedTradeOverrideKeys(trade) {
  if (!trade) return [];
  const accountName = normalizeAccountName(trade.account);
  const closedDate = normalizeDateInput(trade.closedDate) || String(trade.closedDate || '').trim();
  const openedDate = normalizeDateInput(trade.openedDate) || String(trade.openedDate || '').trim();
  const symbol = String(trade.symbol || '').trim();
  const baseSymbol = String(trade.baseSym || '').trim();
  const qty = formatOverrideNumber(Math.abs(Number(trade.qty)));
  const term = String(trade.term || '').trim().toUpperCase();
  const tradeType = getRealizedTradeAssetTypeToken(trade);

  const stableKeys = [
    ['REALIZED_V2', accountName, symbol, closedDate, openedDate, qty, term, tradeType].join('::'),
    baseSymbol && baseSymbol !== symbol
      ? ['REALIZED_V2', accountName, baseSymbol, closedDate, openedDate, qty, term, tradeType].join('::')
      : null,
  ].filter(Boolean);

  const legacyKey = getLegacyRealizedTradeOverrideKey(trade);
  return [...new Set([...stableKeys, legacyKey].filter(Boolean))];
}

function getRealizedTradeOverrideMatch(trade, sectorOverrides = {}) {
  const keys = getRealizedTradeOverrideKeys(trade);
  for (const key of keys) {
    const value = sectorOverrides[key];
    if (value) return { key, value, keys };
  }
  return {
    key: keys[0] || null,
    value: null,
    keys,
  };
}

function getRealizedTradeExplicitAttributionOverride(trade, realizedTradeAttributionOverrides = {}) {
  const keys = getRealizedTradeOverrideKeys(trade);
  for (const key of keys) {
    const value = realizedTradeAttributionOverrides[key];
    if (value) return normalizeAccountName(value);
  }
  return '';
}

function getRealizedTradeInheritedAccount(trade, positionAttributionOverrides = {}) {
  const heldAccount = normalizeAccountName(trade?.account);
  const candidates = [...new Set([
    trade?.baseSym,
    trade?.symbol,
    getFutureRootSymbol(trade?.baseSym),
    getFutureRootSymbol(trade?.symbol),
  ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))];
  for (const candidate of candidates) {
    const positionKey = heldAccount && candidate ? `${heldAccount}::${candidate}` : '';
    const mappedAccount = positionKey ? positionAttributionOverrides[positionKey] : '';
    if (mappedAccount) return normalizeAccountName(mappedAccount);
  }
  return heldAccount;
}

function getRealizedTradeMergeKey(trade, fallback = '') {
  const importKey = String(trade?.importKey || '').trim();
  if (importKey) return importKey;
  const overrideKeys = getRealizedTradeOverrideKeys(trade);
  if (overrideKeys.length) return overrideKeys[0];
  return fallback;
}

function mergeImportedRealizedTrades(existingTrades = [], incomingTrades = []) {
  const merged = new Map();
  [...(existingTrades || []), ...(incomingTrades || [])].forEach((trade, index) => {
    if (!trade) return;
    const fallback = `REALIZED_MERGE::${index}::${normalizeAccountName(trade?.account)}::${trade?.symbol || ''}::${trade?.closedDate || ''}::${trade?.gain || ''}`;
    merged.set(getRealizedTradeMergeKey(trade, fallback), trade);
  });
  return [...merged.values()].sort((left, right) => {
    const leftClosed = normalizeDateInput(left?.closedDate) || '';
    const rightClosed = normalizeDateInput(right?.closedDate) || '';
    if (leftClosed !== rightClosed) return rightClosed.localeCompare(leftClosed);
    const leftOpened = normalizeDateInput(left?.openedDate) || '';
    const rightOpened = normalizeDateInput(right?.openedDate) || '';
    if (leftOpened !== rightOpened) return rightOpened.localeCompare(leftOpened);
    const leftAccount = normalizeAccountName(left?.account);
    const rightAccount = normalizeAccountName(right?.account);
    if (leftAccount !== rightAccount) return leftAccount.localeCompare(rightAccount);
    return String(left?.symbol || '').localeCompare(String(right?.symbol || ''));
  });
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

function normalizeDateMap(rawMap) {
  const normalized = {};
  Object.entries(asPlainObject(rawMap)).forEach(([key, value]) => {
    const iso = normalizeDateInput(value);
    if (key && iso) normalized[key] = iso;
  });
  return normalized;
}

function normalizeFuturesPnlSnapshots(rawSnapshots) {
  const normalized = {};
  Object.entries(asPlainObject(rawSnapshots)).forEach(([key, snapshotMap]) => {
    const nextMap = {};
    Object.entries(asPlainObject(snapshotMap)).forEach(([date, pnl]) => {
      const iso = normalizeDateInput(date);
      const numeric = Number(pnl);
      if (iso && Number.isFinite(numeric)) nextMap[iso] = numeric;
    });
    if (Object.keys(nextMap).length) normalized[key] = nextMap;
  });
  return normalized;
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
    positionAttributionOverrides: asPlainObject(rawState?.positionAttributionOverrides),
    realizedTradeAttributionOverrides: asPlainObject(rawState?.realizedTradeAttributionOverrides),
    positionTransferEffectiveDates: normalizeDateMap(rawState?.positionTransferEffectiveDates),
    futuresPnlSnapshots: normalizeFuturesPnlSnapshots(rawState?.futuresPnlSnapshots),
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
    positionAttributionOverrides: normalized.positionAttributionOverrides,
    realizedTradeAttributionOverrides: normalized.realizedTradeAttributionOverrides,
    positionTransferEffectiveDates: normalized.positionTransferEffectiveDates,
    futuresPnlSnapshots: normalized.futuresPnlSnapshots,
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
    || Object.keys(normalized.positionAttributionOverrides || {}).length
    || Object.keys(normalized.realizedTradeAttributionOverrides || {}).length
    || Object.keys(normalized.positionTransferEffectiveDates || {}).length
    || Object.keys(normalized.futuresPnlSnapshots || {}).length
  );
}

function cloneJSONValue(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function deepEqualJSON(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function isMergeableObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeSharedStateValues(baseValue, localValue, remoteValue, path = '') {
  if (deepEqualJSON(localValue, baseValue)) {
    return { value: cloneJSONValue(remoteValue), conflicts: [] };
  }
  if (deepEqualJSON(remoteValue, baseValue)) {
    return { value: cloneJSONValue(localValue), conflicts: [] };
  }
  if (deepEqualJSON(localValue, remoteValue)) {
    return { value: cloneJSONValue(localValue), conflicts: [] };
  }

  if (isMergeableObject(baseValue) || isMergeableObject(localValue) || isMergeableObject(remoteValue)) {
    const baseObject = isMergeableObject(baseValue) ? baseValue : {};
    const localObject = isMergeableObject(localValue) ? localValue : {};
    const remoteObject = isMergeableObject(remoteValue) ? remoteValue : {};
    const merged = {};
    const conflicts = [];
    const keys = [...new Set([
      ...Object.keys(baseObject),
      ...Object.keys(localObject),
      ...Object.keys(remoteObject),
    ])];

    keys.forEach((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      const result = mergeSharedStateValues(baseObject[key], localObject[key], remoteObject[key], nextPath);
      if (result.conflicts.length) {
        conflicts.push(...result.conflicts);
        return;
      }
      if (result.value !== undefined) merged[key] = result.value;
    });

    return { value: merged, conflicts };
  }

  return { value: cloneJSONValue(localValue), conflicts: [path || '(root)'] };
}

function mergeSharedDashboardStates(baseState, localState, remoteState) {
  const base = buildSharedDashboardStatePayload(baseState || {});
  const local = buildSharedDashboardStatePayload(localState || {});
  const remote = buildSharedDashboardStatePayload(remoteState || {});
  const result = mergeSharedStateValues(base, local, remote);
  return {
    mergedState: buildSharedDashboardStatePayload(result.value || {}),
    conflicts: result.conflicts || [],
  };
}

function resolveMainSector(symbol, cleanSym, assetType = "") {
  const futureSector = resolveStatementFutureSector(symbol, symbol);
  if (futureSector) return futureSector;
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

function parseCSVRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => parseCSVLine(line))
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseStatementNumber(value) {
  const raw = String(value ?? '').replace(/"/g, '').trim();
  if (!raw) return NaN;
  const negative = raw.includes('(') || /^-/.test(raw);
  const normalized = raw
    .replace(/[,$()%+]/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .trim();
  if (!normalized) return NaN;
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -Math.abs(parsed) : parsed;
}

function parseStatementMultiplier(value) {
  const raw = String(value ?? '').replace(/"/g, '').trim();
  if (!raw) return 1;
  const fractionMatch = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const denominator = parseFloat(fractionMatch[2]);
    return Number.isFinite(denominator) && denominator !== 0 ? denominator : 1;
  }
  const parsed = parseStatementNumber(raw);
  return Number.isFinite(parsed) && parsed !== 0 ? Math.abs(parsed) : 1;
}

function extractStatementDate(text, accountHint = '') {
  const candidates = [String(accountHint || ''), String(text || '')];
  for (const candidate of candidates) {
    const isoMatch = candidate.match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return normalizeDateInput(`${year}-${month}-${day}`);
    }
    const usMatch = candidate.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return normalizeDateInput(`${month}/${day}/${year}`);
    }
  }
  return todayIsoLocal();
}

function getFutureRootSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  const token = raw.split(/\s+/)[0];
  const match = token.match(/^((?:\/)?[A-Z0-9]{1,5}?)[FGHJKMNQUVXZ](?:20)?\d{1,2}$/);
  return match ? match[1] : token;
}

function isStatementFutureOptionSymbol(symbol) {
  return /^\/[A-Z0-9]+[CP]\d+(?:\.\d+)?$/i.test(String(symbol || '').trim());
}

function buildStatementFutureOptionSymbol(optionRoot, strike, optionType) {
  const root = String(optionRoot || '').replace(/"/g, '').trim().toUpperCase();
  const strikeText = String(strike || '').replace(/"/g, '').trim();
  if (!root) return '';
  if (!strikeText) return root;
  return `${root}${String(optionType || '').trim().toUpperCase().startsWith('P') ? 'P' : 'C'}${strikeText}`;
}

function resolveStatementFutureSector(symbol, description = '') {
  const root = getFutureRootSymbol(symbol);
  if (root && FUTURES_ROOT_TO_SECTOR[root]) return FUTURES_ROOT_TO_SECTOR[root];

  const upper = String(description || '').toUpperCase();
  if (upper.includes('BITCOIN') || upper.includes('ETHEREUM')) return 'Crypto';
  if (
    upper.includes('FUTURES')
    || upper.includes('CRUDE')
    || upper.includes('SOYBEAN')
    || upper.includes('CORN')
    || upper.includes('GOLD')
    || upper.includes('SILVER')
    || upper.includes('COPPER')
    || upper.includes('NATURAL GAS')
    || upper.includes('CATTLE')
  ) {
    return 'Commodities';
  }
  if (upper.includes('E-MINI') || upper.includes('MICRO E-MINI') || upper.includes('NASDAQ-100') || upper.includes('RUSSELL') || upper.includes('DOW')) {
    return 'Equities';
  }
  return null;
}

function getUploadedAssetMeta(symbol, description = '', assetType = '') {
  const rawSymbol = String(symbol || '').replace(/"/g, '').trim().toUpperCase();
  const descriptionText = String(description || '').replace(/"/g, '').trim();
  const assetTypeText = String(assetType || '').trim().toLowerCase();
  const optionLike = assetTypeText.includes('option') || rawSymbol.includes(' ') || /\d{2}\/\d{2}\/\d{4}/.test(rawSymbol);
  const futureSector = resolveStatementFutureSector(rawSymbol, descriptionText);
  const futureLike = assetTypeText.includes('future') || Boolean(futureSector);
  const baseToken = rawSymbol.split(' ')[0] || rawSymbol;
  const baseSymbol = futureLike ? (getFutureRootSymbol(rawSymbol) || baseToken) : baseToken;
  return {
    assetType: futureLike ? (optionLike ? 'Futures Option' : 'Future') : (optionLike ? 'Option' : 'Equity'),
    baseSymbol,
    futureLike,
    optionLike,
    mainSector: futureLike
      ? futureSector
      : resolveMainSector(baseSymbol, baseSymbol.replace(/[\/.\- ]/g, '_'), optionLike ? 'Option' : assetType),
  };
}

function buildEmptyAccountData() {
  return { positions: [], total: 0, cost: 0, cash: 0 };
}

function findDefaultFuturesHeldAccount(knownAccounts = []) {
  const uniqueAccounts = [...new Set((knownAccounts || []).filter(Boolean))];
  const exact = uniqueAccounts.find((accountName) => accountName.endsWith(`...${DEFAULT_FUTURES_HELD_ACCOUNT_SUFFIX}`));
  if (exact) return exact;
  return normalizeAccountName(`Limit Liability Company ...${DEFAULT_FUTURES_HELD_ACCOUNT_SUFFIX}`);
}

function chooseFuturesStatementAccount(text, accountHint, preferredAccount, knownAccounts = [], selectedAccount = 'ALL') {
  if (preferredAccount && preferredAccount !== FUTURES_STATEMENT_ACCOUNT_AUTO) return preferredAccount;

  const candidates = [text, accountHint]
    .map((value) => String(value || ''))
    .join('\n');
  const explicitMasked = candidates.match(/(?:Individual|Limit(?:_| )Liability(?:_| )Company)\s+\.{3}(\d+)/i);
  if (explicitMasked) {
    const exact = [...new Set(knownAccounts.filter(Boolean))].find((accountName) => accountName.endsWith(`...${explicitMasked[1]}`));
    if (exact) return exact;
    return normalizeAccountName(`Limit Liability Company ...${explicitMasked[1]}`);
  }

  const filenameMatch = String(accountHint || '').match(/X{3,4}(\d{3,4})/i);
  if (filenameMatch) {
    const exact = [...new Set(knownAccounts.filter(Boolean))].find((accountName) => accountName.endsWith(`...${filenameMatch[1]}`));
    if (exact) return exact;
  }

  const defaultHeldAccount = findDefaultFuturesHeldAccount(knownAccounts);
  if (defaultHeldAccount) return defaultHeldAccount;

  if (selectedAccount && selectedAccount !== 'ALL') return selectedAccount;
  if (knownAccounts.length === 1) return knownAccounts[0];
  return FUTURES_CLEARING_ACCOUNT;
}

function mergeStandardPositionAccounts(existingAccounts = {}, parsedAccounts = {}) {
  const next = {};
  const accountNames = [...new Set([...Object.keys(existingAccounts || {}), ...Object.keys(parsedAccounts || {})])];
  accountNames.forEach((accountName) => {
    const existing = existingAccounts?.[accountName] || buildEmptyAccountData();
    const parsed = parsedAccounts?.[accountName];
    const preservedSupplemental = (existing.positions || []).filter((position) => position?.source === POSITION_SOURCE_FUTURES);
    if (parsed) {
      next[accountName] = {
        ...buildEmptyAccountData(),
        ...parsed,
        positions: [...(parsed.positions || []), ...preservedSupplemental],
      };
      return;
    }
    if (preservedSupplemental.length) {
      next[accountName] = {
        ...buildEmptyAccountData(),
        total: Number(existing.total) || 0,
        cost: Number(existing.cost) || 0,
        cash: Number(existing.cash) || 0,
        positions: preservedSupplemental,
      };
    }
  });
  return next;
}

function mergeSupplementalFuturesAccounts(existingAccounts = {}, parsedAccounts = {}) {
  const next = {};
  const accountNames = [...new Set([...Object.keys(existingAccounts || {}), ...Object.keys(parsedAccounts || {})])];
  accountNames.forEach((accountName) => {
    const existing = existingAccounts?.[accountName] || buildEmptyAccountData();
    const incoming = parsedAccounts?.[accountName];
    const retainedPositions = (existing.positions || []).filter((position) => position?.source !== POSITION_SOURCE_FUTURES);
    const mergedPositions = [...retainedPositions, ...(incoming?.positions || [])];
    if (!mergedPositions.length && !incoming && !(Number(existing.total) || Number(existing.cost) || Number(existing.cash))) {
      return;
    }
    next[accountName] = {
      ...buildEmptyAccountData(),
      total: Number(incoming?.total ?? existing.total) || 0,
      cost: Number(incoming?.cost ?? existing.cost) || 0,
      cash: Number(incoming?.cash ?? existing.cash) || 0,
      positions: mergedPositions,
    };
  });
  return next;
}

function mergeFuturesPnlSnapshots(existingSnapshots = {}, incomingSnapshots = {}) {
  const next = normalizeFuturesPnlSnapshots(existingSnapshots);
  Object.entries(normalizeFuturesPnlSnapshots(incomingSnapshots)).forEach(([key, snapshotMap]) => {
    next[key] = {
      ...(next[key] || {}),
      ...snapshotMap,
    };
  });
  return next;
}

function migrateLegacyFuturesClearingAccount(accounts = {}, sectorOverrides = {}, positionAttributionOverrides = {}) {
  const clearingAccount = accounts?.[FUTURES_CLEARING_ACCOUNT];
  const futuresRows = (clearingAccount?.positions || []).filter((position) => position?.source === POSITION_SOURCE_FUTURES);
  if (!futuresRows.length) {
    return {
      accounts,
      sectorOverrides,
      positionAttributionOverrides,
      migrated: false,
    };
  }

  const targetAccount = findDefaultFuturesHeldAccount([
    ...Object.keys(accounts || {}).filter((name) => name && name !== FUTURES_CLEARING_ACCOUNT),
  ]);
  if (!targetAccount || targetAccount === FUTURES_CLEARING_ACCOUNT) {
    return {
      accounts,
      sectorOverrides,
      positionAttributionOverrides,
      migrated: false,
    };
  }

  const nextAccounts = { ...(accounts || {}) };
  const targetData = nextAccounts[targetAccount] || buildEmptyAccountData();
  const clearingNonFutures = (clearingAccount?.positions || []).filter((position) => position?.source !== POSITION_SOURCE_FUTURES);
  const movedRows = futuresRows.map((position) => ({ ...position, account: targetAccount }));

  nextAccounts[targetAccount] = {
    ...buildEmptyAccountData(),
    ...targetData,
    positions: [...(targetData.positions || []), ...movedRows],
  };

  if (clearingNonFutures.length || Number(clearingAccount?.total) || Number(clearingAccount?.cost) || Number(clearingAccount?.cash)) {
    nextAccounts[FUTURES_CLEARING_ACCOUNT] = {
      ...buildEmptyAccountData(),
      ...clearingAccount,
      positions: clearingNonFutures,
    };
  } else {
    delete nextAccounts[FUTURES_CLEARING_ACCOUNT];
  }

  const symbolsToMove = new Set(
    futuresRows.flatMap((position) => [
      position?.symbol,
      position?.normalizedSymbol,
      position?.overrideSymbol,
      position?.baseSymbol,
    ].filter(Boolean)),
  );

  const nextSectorOverrides = { ...(sectorOverrides || {}) };
  symbolsToMove.forEach((symbol) => {
    const sourceKey = getSectorOverrideKey(FUTURES_CLEARING_ACCOUNT, symbol);
    const targetKey = getSectorOverrideKey(targetAccount, symbol);
    if (sourceKey in nextSectorOverrides) {
      if (!(targetKey in nextSectorOverrides)) nextSectorOverrides[targetKey] = nextSectorOverrides[sourceKey];
      delete nextSectorOverrides[sourceKey];
    }
  });

  const nextPositionAttributionOverrides = { ...(positionAttributionOverrides || {}) };
  futuresRows.forEach((position) => {
    const underlying = getPositionUnderlying(position);
    if (!underlying) return;
    const sourceKey = `${FUTURES_CLEARING_ACCOUNT}::${underlying}`;
    const targetKey = `${targetAccount}::${underlying}`;
    if (sourceKey in nextPositionAttributionOverrides) {
      if (!(targetKey in nextPositionAttributionOverrides)) nextPositionAttributionOverrides[targetKey] = nextPositionAttributionOverrides[sourceKey];
      delete nextPositionAttributionOverrides[sourceKey];
    }
  });

  return {
    accounts: nextAccounts,
    sectorOverrides: nextSectorOverrides,
    positionAttributionOverrides: nextPositionAttributionOverrides,
    migrated: true,
    targetAccount,
  };
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
      const assetMeta = getUploadedAssetMeta(rawSymbol, description, assetType);
      const isOption = assetMeta.optionLike;
      const futureLike = assetMeta.futureLike;
      const baseSymbol = (assetMeta.baseSymbol || rawSymbol.match(/^[A-Z]+(?:[./-][A-Z]+)?(?:\/[A-Z]+)?/)?.[0] || rawSymbol.split(' ')[0] || rawSymbol)
        .replace(/[^A-Z0-9/._-]/g, '');
      const normalizedSymbol = rawSymbol.replace(/[^A-Z0-9/._ -]/g, '').trim();
      const sectorLookupSym = futureLike ? baseSymbol : (isOption ? baseSymbol : normalizedSymbol);
      const cleanSym = sectorLookupSym.replace(/[\/.\- ]/g, '_');
      const mainSector = assetMeta.mainSector;
      accounts[currentAccount].positions.push({
        account: currentAccount,
        symbol: rawSymbol,
        normalizedSymbol,
        baseSymbol,
        overrideSymbol: futureLike ? baseSymbol : (isOption ? baseSymbol : normalizedSymbol),
        historySymbol: isOption || futureLike ? null : normalizedSymbol,
        cleanSym,
        description,
        qty,
        price,
        mktVal,
        costBasis,
        gainPct,
        assetType: assetMeta.assetType,
        source: POSITION_SOURCE_STANDARD,
        sector: mainSector || UNCLASSIFIED_SECTOR,
        mainSector,
        isSectorETF: !isOption && mainSector ? cleanSym === SECTOR_TO_ETF[mainSector] : false,
      });
    }
  }
  return accounts;
}

function parseFuturesStatementCSV(text, {
  accountHint = '',
  preferredAccount = FUTURES_STATEMENT_ACCOUNT_AUTO,
  existingAccountNames = [],
  selectedAccount = 'ALL',
} = {}) {
  const rows = parseCSVRows(text);
  const statementDate = extractStatementDate(text, accountHint);
  const accountName = chooseFuturesStatementAccount(text, accountHint, preferredAccount, existingAccountNames, selectedAccount);
  const accounts = { [accountName]: buildEmptyAccountData() };
  const futuresPnlSnapshots = {};
  const realizedTrades = [];
  if (!rows.length) return {
    accounts,
    accountName,
    importedCount: 0,
    statementDate,
    futuresPnlSnapshots,
    realizedTrades,
  };

  const isSectionHeader = (row = []) => {
    if (!row.length) return false;
    const first = String(row[0] || '').trim();
    if (!first) return false;
    return row.length === 1 || !row.slice(1).some((cell) => String(cell || '').trim());
  };
  const findSectionIndex = (name) => rows.findIndex((row) => isSectionHeader(row) && normalizeHeader(row[0]) === normalizeHeader(name));

  const readSectionRows = (name) => {
    const sectionIndex = findSectionIndex(name);
    if (sectionIndex < 0 || !rows[sectionIndex + 1]) return { header: [], rows: [] };
    const header = rows[sectionIndex + 1].map((cell) => normalizeHeader(cell));
    const dataRows = [];
    for (let i = sectionIndex + 2; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) break;
      if (isSectionHeader(row)) break;
      const rowText = row.map((cell) => String(cell || '').trim()).join(' ');
      if (!rowText) break;
      if (/overall totals/i.test(rowText) || /subtotal/i.test(rowText)) break;
      dataRows.push(row);
    }
    return { header, rows: dataRows };
  };
  const readRowCell = (row, index) => (index >= 0 && index < row.length ? String(row[index] || '').replace(/"/g, '').trim() : '');

  const accountTradeHistorySection = readSectionRows('Account Trade History');
  const groupedTradeHistoryRows = [];
  const futureTradeActivityBySymbol = new Map();
  if (accountTradeHistorySection.header.length) {
    const execTimeIdx = accountTradeHistorySection.header.indexOf('exec_time');
    const posEffectIdx = accountTradeHistorySection.header.indexOf('pos_effect');
    const symbolIdx = accountTradeHistorySection.header.indexOf('symbol');
    const expIdx = accountTradeHistorySection.header.indexOf('exp');
    const typeIdx = accountTradeHistorySection.header.indexOf('type');

    let currentExecDate = '';
    let currentGroup = [];
    const commitTradeHistoryGroup = () => {
      if (!currentGroup.length) return;
      groupedTradeHistoryRows.push(currentGroup);
      currentGroup = [];
    };

    accountTradeHistorySection.rows.forEach((row) => {
      const execTime = readRowCell(row, execTimeIdx);
      if (execTime && currentGroup.length) commitTradeHistoryGroup();
      currentGroup.push(row);

      const normalizedExecDate = normalizeDateInput(execTime.split(/\s+/)[0] || execTime || '');
      if (normalizedExecDate) currentExecDate = normalizedExecDate;

      const tradeType = readRowCell(row, typeIdx).toUpperCase();
      if (!currentExecDate || tradeType !== 'FUTURE') return;

      const positionEffect = readRowCell(row, posEffectIdx).toUpperCase();
      const rawSymbol = readRowCell(row, symbolIdx).toUpperCase();
      const expirySymbol = readRowCell(row, expIdx).toUpperCase();
      const futureSymbol = [rawSymbol, expirySymbol]
        .map((value) => String(value || '').split(/\s+/)[0].trim().toUpperCase())
        .find((value) => value.startsWith('/')) || '';
      if (!futureSymbol) return;

      const activity = futureTradeActivityBySymbol.get(futureSymbol) || {};
      if (!activity.firstTradeDate || currentExecDate < activity.firstTradeDate) activity.firstTradeDate = currentExecDate;
      if (positionEffect.includes('TO OPEN') && (!activity.firstOpenDate || currentExecDate < activity.firstOpenDate)) {
        activity.firstOpenDate = currentExecDate;
      }
      if (positionEffect.includes('TO CLOSE') && (!activity.lastCloseDate || currentExecDate > activity.lastCloseDate)) {
        activity.lastCloseDate = currentExecDate;
      }
      futureTradeActivityBySymbol.set(futureSymbol, activity);
    });

    commitTradeHistoryGroup();
  }

  const profitsSection = readSectionRows('Profits and Losses');
  const profitsLookup = new Map();
  if (profitsSection.header.length) {
    const symbolIdx = profitsSection.header.indexOf('symbol');
    const descIdx = profitsSection.header.indexOf('description');
    const pnlOpenIdx = profitsSection.header.indexOf('p_l_open');
    const pnlPctIdx = profitsSection.header.indexOf('p_l');
    const pnlDayIdx = profitsSection.header.indexOf('p_l_day');
    const pnlYtdIdx = profitsSection.header.indexOf('p_l_ytd');
    const marginReqIdx = profitsSection.header.indexOf('margin_req');
    const markValueIdx = profitsSection.header.indexOf('mark_value');
    profitsSection.rows.forEach((row) => {
      const symbol = readRowCell(row, symbolIdx).toUpperCase();
      if (!symbol) return;
      const description = readRowCell(row, descIdx);
      const profitEntry = {
        description,
        pnlOpen: parseStatementNumber(row[pnlOpenIdx]),
        gainPct: parseStatementNumber(row[pnlPctIdx]),
        pnlDay: parseStatementNumber(row[pnlDayIdx]),
        pnlYtd: parseStatementNumber(row[pnlYtdIdx]),
        marginReq: parseStatementNumber(row[marginReqIdx]),
        markValue: parseStatementNumber(row[markValueIdx]),
      };
      profitsLookup.set(symbol, profitEntry);

      const assetMeta = getUploadedAssetMeta(symbol, description, 'Future');
      if (!assetMeta.futureLike) return;
      const pnlOpen = Number.isFinite(profitEntry.pnlOpen) ? profitEntry.pnlOpen : 0;
      const pnlYtd = Number.isFinite(profitEntry.pnlYtd) ? profitEntry.pnlYtd : 0;
      const realizedPnl = pnlYtd - pnlOpen;
      if (!Number.isFinite(realizedPnl) || Math.abs(realizedPnl) < 0.0001) return;
      const futureActivity = futureTradeActivityBySymbol.get(symbol) || {};
      const markValue = Number.isFinite(profitEntry.markValue) ? profitEntry.markValue : 0;
      const isClosedContract = Math.abs(markValue) < 0.0001 && Math.abs(pnlOpen) < 0.0001;
      const closedDate = isClosedContract ? (futureActivity.lastCloseDate || statementDate) : statementDate;
      const openedDate = futureActivity.firstOpenDate || futureActivity.firstTradeDate || closedDate;
      const futureOptionLike = isStatementFutureOptionSymbol(symbol) || /\bCALL\b|\bPUT\b/i.test(description);
      const baseSym = symbol;
      const mainSector = assetMeta.mainSector || resolveStatementFutureSector(baseSym, description);
      realizedTrades.push({
        account: accountName,
        symbol,
        baseSym,
        closedDate,
        openedDate,
        qty: 0,
        proceeds: null,
        cost: null,
        gain: realizedPnl,
        gainPct: null,
        term: 'Short Term',
        assetType: futureOptionLike ? 'Futures Option' : 'Future',
        isOption: futureOptionLike,
        isFuture: true,
        sector: mainSector || UNCLASSIFIED_SECTOR,
        mainSector,
        description,
        derivedSummary: true,
        isStatementClosedContract: isClosedContract,
        importKey: ['FUTURES_STMT_PNL', accountName, futureOptionLike ? 'FUT_OPT' : 'FUT', symbol].join('::'),
        importSource: 'futures_statement',
      });
    });
  }

  const pushPosition = (position, snapshotPnl = null) => {
    if (!position || !position.symbol || !Number.isFinite(position.qty) || position.qty === 0) return;
    accounts[accountName].positions.push(position);
    if (position?.source === POSITION_SOURCE_FUTURES && Number.isFinite(Number(snapshotPnl))) {
      const snapshotKey = getPositionSnapshotKey(position);
      if (snapshotKey) {
        futuresPnlSnapshots[snapshotKey] = {
          ...(futuresPnlSnapshots[snapshotKey] || {}),
          [statementDate]: Number(snapshotPnl) + Number(futuresPnlSnapshots[snapshotKey]?.[statementDate] || 0),
        };
      }
    }
  };

  const futuresSection = readSectionRows('Futures');
  if (futuresSection.header.length) {
    const symbolIdx = futuresSection.header.indexOf('symbol');
    const descIdx = futuresSection.header.indexOf('description');
    const spcIdx = futuresSection.header.indexOf('spc');
    const expIdx = futuresSection.header.indexOf('exp');
    const qtyIdx = futuresSection.header.indexOf('qty');
    const tradeIdx = futuresSection.header.indexOf('trade_price');
    const markIdx = futuresSection.header.indexOf('mark');

    futuresSection.rows.forEach((row) => {
      const rawSymbol = String(row[symbolIdx] || '').trim().toUpperCase();
      if (!rawSymbol) return;
      const qty = parseStatementNumber(row[qtyIdx]);
      if (!Number.isFinite(qty) || qty === 0) return;
      const description = String(row[descIdx] || '').replace(/"/g, '').trim();
      const multiplier = parseStatementMultiplier(row[spcIdx]);
      const tradePrice = parseStatementNumber(row[tradeIdx]);
      const mark = parseStatementNumber(row[markIdx]);
      const profitRow = profitsLookup.get(rawSymbol) || {};
      const pnlOpen = Number.isFinite(profitRow.pnlOpen)
        ? profitRow.pnlOpen
        : (Number.isFinite(mark) && Number.isFinite(tradePrice) ? qty * (mark - tradePrice) * multiplier : 0);
      const gainPct = Number.isFinite(profitRow.gainPct)
        ? profitRow.gainPct
        : 0;
      const mainSector = resolveStatementFutureSector(rawSymbol, description);
      const expiryText = String(row[expIdx] || '').replace(/"/g, '').trim();

      const position = {
        account: accountName,
        symbol: rawSymbol,
        normalizedSymbol: rawSymbol,
        baseSymbol: rawSymbol,
        overrideSymbol: rawSymbol,
        historySymbol: null,
        cleanSym: rawSymbol.replace(/[\/.\- ]/g, '_'),
        description: expiryText ? `${description} · ${expiryText}` : description,
        qty,
        price: Number.isFinite(mark) ? mark : (Number.isFinite(tradePrice) ? tradePrice : 0),
        tradePrice: Number.isFinite(tradePrice) ? tradePrice : null,
        markPrice: Number.isFinite(mark) ? mark : null,
        multiplier,
        mktVal: Number.isFinite(pnlOpen) ? pnlOpen : 0,
        costBasis: 0,
        gainPct,
        assetType: 'Future',
        source: POSITION_SOURCE_FUTURES,
        sector: mainSector || UNCLASSIFIED_SECTOR,
        mainSector,
        isSectorETF: false,
        marginReq: Number.isFinite(profitRow.marginReq) ? profitRow.marginReq : null,
        pnlDay: Number.isFinite(profitRow.pnlDay) ? profitRow.pnlDay : null,
        pnlYtd: Number.isFinite(profitRow.pnlYtd) ? profitRow.pnlYtd : null,
      };
      pushPosition(position, pnlOpen);
    });
  }

  const futuresOptionsSection = readSectionRows('Futures Options');
  if (futuresOptionsSection.header.length) {
    const symbolIdx = futuresOptionsSection.header.indexOf('symbol');
    const optionCodeIdx = futuresOptionsSection.header.indexOf('option_code');
    const expIdx = futuresOptionsSection.header.indexOf('exp');
    const strikeIdx = futuresOptionsSection.header.indexOf('strike');
    const typeIdx = futuresOptionsSection.header.indexOf('type');
    const qtyIdx = futuresOptionsSection.header.indexOf('qty');
    const tradeIdx = futuresOptionsSection.header.indexOf('trade_price');
    const markIdx = futuresOptionsSection.header.indexOf('mark');
    const markValueIdx = futuresOptionsSection.header.indexOf('mark_value');

    futuresOptionsSection.rows.forEach((row) => {
      const contractDescription = String(row[symbolIdx] || '').replace(/"/g, '').trim();
      const optionCode = String(row[optionCodeIdx] || '').replace(/"/g, '').trim().toUpperCase();
      const rawUnderlying = contractDescription.split(/\s+/)[0]?.toUpperCase() || '';
      const qty = parseStatementNumber(row[qtyIdx]);
      if (!optionCode || !Number.isFinite(qty) || qty === 0) return;
      const multiplier = parseStatementMultiplier(contractDescription.match(/\d+\s*\/\s*\d+/)?.[0] || '');
      const tradePrice = parseStatementNumber(row[tradeIdx]);
      const mark = parseStatementNumber(row[markIdx]);
      const explicitMarkValue = parseStatementNumber(row[markValueIdx]);
      const mktVal = Number.isFinite(explicitMarkValue)
        ? explicitMarkValue
        : (Number.isFinite(mark) ? qty * mark * multiplier : 0);
      const costBasis = Number.isFinite(tradePrice) ? qty * tradePrice * multiplier : 0;
      const gainPct = costBasis
        ? ((mktVal - costBasis) / Math.abs(costBasis)) * 100
        : 0;
      const description = [
        contractDescription,
        String(row[typeIdx] || '').trim().toUpperCase(),
        String(row[strikeIdx] || '').trim(),
      ].filter(Boolean).join(' · ');
      const mainSector = resolveStatementFutureSector(rawUnderlying, contractDescription);

      const position = {
        account: accountName,
        symbol: optionCode,
        normalizedSymbol: optionCode,
        baseSymbol: rawUnderlying || optionCode,
        overrideSymbol: rawUnderlying || optionCode,
        historySymbol: null,
        cleanSym: optionCode.replace(/[\/.\- ]/g, '_'),
        description,
        qty,
        price: Number.isFinite(mark) ? mark : (Number.isFinite(tradePrice) ? tradePrice : 0),
        tradePrice: Number.isFinite(tradePrice) ? tradePrice : null,
        markPrice: Number.isFinite(mark) ? mark : null,
        mktVal,
        costBasis,
        gainPct,
        assetType: 'Futures Option',
        source: POSITION_SOURCE_FUTURES,
        sector: mainSector || UNCLASSIFIED_SECTOR,
        mainSector,
        isSectorETF: false,
        expiry: String(row[expIdx] || '').replace(/"/g, '').trim() || null,
        strike: parseStatementNumber(row[strikeIdx]),
        optionType: String(row[typeIdx] || '').replace(/"/g, '').trim().toUpperCase() || null,
        multiplier,
      };
      pushPosition(position, mktVal - costBasis);
    });
  }

  if (groupedTradeHistoryRows.length) {
    const execTimeIdx = accountTradeHistorySection.header.indexOf('exec_time');
    const sideIdx = accountTradeHistorySection.header.indexOf('side');
    const qtyIdx = accountTradeHistorySection.header.indexOf('qty');
    const posEffectIdx = accountTradeHistorySection.header.indexOf('pos_effect');
    const symbolIdx = accountTradeHistorySection.header.indexOf('symbol');
    const expIdx = accountTradeHistorySection.header.indexOf('exp');
    const strikeIdx = accountTradeHistorySection.header.indexOf('strike');
    const typeIdx = accountTradeHistorySection.header.indexOf('type');
    const priceIdx = accountTradeHistorySection.header.indexOf('price');

    const openLotsBySymbol = new Map();

    groupedTradeHistoryRows.slice().reverse().forEach((group) => {
      const execTime = readRowCell(group[0], execTimeIdx);
      const execDate = normalizeDateInput(execTime.split(/\s+/)[0] || execTime || '');
      if (!execDate) return;

      group.forEach((row) => {
        const optionType = readRowCell(row, typeIdx).toUpperCase();
        const optionRoot = readRowCell(row, expIdx).toUpperCase();
        if (!optionRoot.startsWith('/') || !['CALL', 'PUT'].includes(optionType)) return;

        const side = readRowCell(row, sideIdx).toUpperCase();
        const positionEffect = readRowCell(row, posEffectIdx).toUpperCase();
        const underlyingDescription = readRowCell(row, symbolIdx);
        const strikeText = readRowCell(row, strikeIdx);
        const contracts = Math.abs(parseStatementNumber(readRowCell(row, qtyIdx)));
        const premium = parseStatementNumber(readRowCell(row, priceIdx));
        if (!Number.isFinite(contracts) || contracts === 0 || !Number.isFinite(premium)) return;

        const optionSymbol = buildStatementFutureOptionSymbol(optionRoot, strikeText, optionType);
        if (!optionSymbol) return;

        const multiplier = parseStatementMultiplier(String(underlyingDescription || '').match(/\d+\s*\/\s*\d+/)?.[0] || '');
        const baseSym = String(underlyingDescription || '').split(/\s+/)[0].trim().toUpperCase()
          || getFutureRootSymbol(optionRoot)
          || optionRoot;
        const mainSector = resolveStatementFutureSector(baseSym || optionRoot, underlyingDescription);
        const description = [underlyingDescription, strikeText, optionType].filter(Boolean).join(' · ');
        const lots = openLotsBySymbol.get(optionSymbol) || [];

        if (positionEffect.includes('TO OPEN')) {
          lots.push({
            qtyRemaining: contracts,
            openedDate: execDate,
            openPrice: premium,
            positionSide: side === 'BUY' ? 'long' : 'short',
            multiplier,
            baseSym,
            mainSector,
            description,
          });
          openLotsBySymbol.set(optionSymbol, lots);
          return;
        }

        if (!positionEffect.includes('TO CLOSE')) return;

        const closingSide = side === 'SELL' ? 'long' : 'short';
        let remainingContracts = contracts;
        for (const lot of lots) {
          if (remainingContracts <= 0) break;
          if (!lot || lot.positionSide !== closingSide || !(lot.qtyRemaining > 0)) continue;

          const matchedContracts = Math.min(remainingContracts, lot.qtyRemaining);
          const proceeds = closingSide === 'long'
            ? premium * matchedContracts * lot.multiplier
            : lot.openPrice * matchedContracts * lot.multiplier;
          const cost = closingSide === 'long'
            ? lot.openPrice * matchedContracts * lot.multiplier
            : premium * matchedContracts * lot.multiplier;
          const gain = proceeds - cost;
          const signedQty = closingSide === 'short' ? -matchedContracts : matchedContracts;

          realizedTrades.push({
            account: accountName,
            symbol: optionSymbol,
            baseSym: lot.baseSym || baseSym,
            closedDate: execDate,
            openedDate: lot.openedDate || execDate,
            qty: signedQty,
            proceeds,
            cost,
            gain,
            gainPct: cost ? (gain / Math.abs(cost)) * 100 : 0,
            term: 'Short Term',
            assetType: 'Futures Option',
            isOption: true,
            isFuture: true,
            sector: lot.mainSector || mainSector || UNCLASSIFIED_SECTOR,
            mainSector: lot.mainSector || mainSector,
            description: lot.description || description,
            importKey: ['FUTURES_STMT_FOP', accountName, optionSymbol, lot.openedDate || execDate, execDate, formatOverrideNumber(Math.abs(signedQty))].join('::'),
            importSource: 'futures_statement',
          });

          lot.qtyRemaining -= matchedContracts;
          remainingContracts -= matchedContracts;
        }

        openLotsBySymbol.set(optionSymbol, lots.filter((lot) => lot && lot.qtyRemaining > 0.0001));
      });
    });
  }

  return {
    accounts,
    accountName,
    importedCount: accounts[accountName].positions.length,
    statementDate,
    futuresPnlSnapshots,
    realizedTrades,
  };
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
    const assetMeta = getUploadedAssetMeta(sym, sym, '');
    const isOption = assetMeta.optionLike;
    const baseSym = assetMeta.baseSymbol || sym.split(' ')[0];
    const mainSector = assetMeta.mainSector;
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
      assetType: assetMeta.assetType,
      isOption,
      isFuture: assetMeta.futureLike,
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

function computeDailyFlowFromTwr(prevNav, nextNav, prevTwr, nextTwr) {
  if (!Number.isFinite(prevNav) || !Number.isFinite(nextNav) || !Number.isFinite(prevTwr) || !Number.isFinite(nextTwr) || prevNav === 0 || prevTwr === 0) {
    return 0;
  }
  const dayReturn = (nextTwr / prevTwr) - 1;
  if (!Number.isFinite(dayReturn)) return 0;
  return nextNav - prevNav - (prevNav * dayReturn);
}

function buildPerformanceModelFromNavPoints(points = [], fallbackSeries = []) {
  const navSeries = Array.isArray(points) && points.length
    ? points
        .map((point) => {
          const nav = Number(point?.nav);
          const twr = Number(point?.twr);
          const date = String(point?.date || '');
          if (!date || !Number.isFinite(nav)) return null;
          return { date, nav, twr: Number.isFinite(twr) && twr > 0 ? twr : null };
        })
        .filter(Boolean)
    : (fallbackSeries || []).map(([date, nav]) => ({ date, nav: Number(nav), twr: null })).filter((point) => point.date && Number.isFinite(point.nav));

  if (!navSeries.length) {
    return {
      navSeries: [],
      twrSeries: [],
      flowSeries: [],
      hasFlowAdjustedReturns: false,
    };
  }

  const baseNav = navSeries[0]?.nav;
  let hasFlowAdjustedReturns = navSeries.some((point) => Number.isFinite(point.twr));
  let previousTwr = null;
  const twrSeries = [];
  const flowSeries = [];

  navSeries.forEach((point, index) => {
    let twrValue = point.twr;
    if (!Number.isFinite(twrValue) || twrValue <= 0) {
      twrValue = Number.isFinite(baseNav) && baseNav !== 0 ? point.nav / baseNav : 1;
      hasFlowAdjustedReturns = false;
    }
    twrSeries.push([point.date, twrValue]);
    if (index === 0) {
      flowSeries.push([point.date, 0]);
      previousTwr = twrValue;
      return;
    }
    const flow = hasFlowAdjustedReturns
      ? computeDailyFlowFromTwr(navSeries[index - 1].nav, point.nav, previousTwr, twrValue)
      : 0;
    flowSeries.push([point.date, Number.isFinite(flow) ? flow : 0]);
    previousTwr = twrValue;
  });

  return {
    navSeries: navSeries.map((point) => [point.date, point.nav]),
    twrSeries,
    flowSeries,
    hasFlowAdjustedReturns,
  };
}

function buildAggregatePerformanceModel(models = {}, accountNames = []) {
  const selectedModels = (accountNames || []).map((name) => models?.[name]).filter((model) => model?.navSeries?.length);
  if (!selectedModels.length) {
    return { navSeries: [], twrSeries: [], flowSeries: [], hasFlowAdjustedReturns: false };
  }

  const dates = [...new Set(selectedModels.flatMap((model) => model.navSeries.map(([date]) => date)))].sort();
  const navMaps = selectedModels.map((model) => new Map(expandHistoryToDates(model.navSeries, dates).map(([date, value]) => [date, value])));
  const flowMaps = selectedModels.map((model) => new Map((model.flowSeries || []).map(([date, value]) => [date, value])));
  const navSeries = [];
  const flowSeries = [];
  const twrSeries = [];
  let previousNav = null;
  let cumulative = 1;

  dates.forEach((date) => {
    const nav = navMaps.reduce((sum, valueMap) => sum + (valueMap.get(date) || 0), 0);
    const flow = flowMaps.reduce((sum, valueMap) => sum + (valueMap.get(date) || 0), 0);
    navSeries.push([date, nav]);
    flowSeries.push([date, flow]);
    if (previousNav === null || !Number.isFinite(previousNav) || previousNav === 0) {
      cumulative = 1;
    } else {
      const dayReturn = (nav - previousNav - flow) / previousNav;
      if (Number.isFinite(dayReturn)) cumulative *= (1 + dayReturn);
    }
    twrSeries.push([date, cumulative]);
    previousNav = nav;
  });

  return {
    navSeries,
    twrSeries,
    flowSeries,
    hasFlowAdjustedReturns: selectedModels.every((model) => model.hasFlowAdjustedReturns),
  };
}

function buildReturnStatsFromSeries(returnSeries, navSeries = []) {
  if (!returnSeries || returnSeries.length < 2) return null;
  const stats = computeReturns(returnSeries);
  const currentNav = navSeries?.[navSeries.length - 1]?.[1];
  return {
    ...stats,
    currentNav: Number.isFinite(currentNav) ? currentNav : stats.currentNav,
  };
}

function getLatestSeriesDate(seriesList) {
  return (seriesList || []).reduce((latest, series) => {
    const next = series?.[series.length - 1]?.[0];
    if (!next) return latest;
    return !latest || next > latest ? next : latest;
  }, null);
}

function filterByTimeframe(data, tf, anchorDateISO = null) {
  if (!data?.length) return data;
  const endDate = anchorDateISO || data[data.length - 1]?.[0];
  const bounded = endDate ? data.filter(([date]) => date <= endDate) : [...data];
  if (!bounded.length) return [];
  const { startDate } = getTimeframeBounds(tf, endDate);
  if (!startDate) return bounded;
  const startIndex = bounded.findIndex(([date]) => date >= startDate);
  if (startIndex === -1) return bounded;
  return bounded.slice(Math.max(0, startIndex - 1));
}

function buildAggregateHistory(histories, accountNames = null) {
  const seriesList = (accountNames?.length
    ? accountNames.map((accountName) => histories?.[accountName])
    : Object.values(histories || {})
  ).filter(series => series?.length);
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

function expandHistoryToDates(series, dates) {
  const points = Array.isArray(series) ? series : [];
  const indices = { value: 0 };
  let lastValue = 0;
  return dates.map((date) => {
    while (indices.value < points.length && points[indices.value][0] <= date) {
      lastValue = points[indices.value][1];
      indices.value += 1;
    }
    return [date, Number.isFinite(lastValue) ? lastValue : 0];
  });
}

function getPositionPnlValue(position) {
  const marketValue = Number(position?.mktVal);
  const costBasis = Number(position?.costBasis);
  if (!Number.isFinite(marketValue)) return NaN;
  if (isFuturePosition(position) && !isOptionPosition(position)) return marketValue;
  return marketValue - (Number.isFinite(costBasis) ? costBasis : 0);
}

function getPositionEffectiveMultiplier(position) {
  const explicit = Math.abs(Number(position?.multiplier));
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const qty = Number(position?.qty);
  const price = Number(position?.price);
  const marketValue = Number(position?.mktVal);
  if (!Number.isFinite(qty) || qty === 0 || !Number.isFinite(price) || price === 0 || !Number.isFinite(marketValue) || marketValue === 0) {
    return 1;
  }
  const inferred = Math.abs(marketValue / (qty * price));
  return Number.isFinite(inferred) && inferred > 0 ? inferred : 1;
}

function clampAttributedCarryValue(value, finalValue) {
  if (!Number.isFinite(value) || !Number.isFinite(finalValue)) return NaN;
  if (Math.abs(finalValue) < 0.0001) return 0;
  if (finalValue > 0) return Math.min(finalValue, Math.max(0, value));
  return Math.max(finalValue, Math.min(0, value));
}

function buildCarryWeightsFromSourceHistory(dates, sourceHistory) {
  if (!Array.isArray(dates) || dates.length < 2 || !sourceHistory?.length) return [];
  return dates.slice(1).map((date, index) => {
    const currentValue = getValueOnOrBefore(sourceHistory, date);
    const previousValue = getValueOnOrBefore(sourceHistory, dates[index]);
    const delta = (Number.isFinite(currentValue) ? currentValue : 0) - (Number.isFinite(previousValue) ? previousValue : 0);
    return Math.abs(delta);
  });
}

function buildMonotonicCarrySeries(dates, finalValue, {
  startValue = 0,
  weights = [],
  lastStepDelta = null,
} = {}) {
  const orderedDates = Array.isArray(dates) ? dates : [];
  if (!orderedDates.length || !Number.isFinite(finalValue)) return [];
  if (orderedDates.length === 1) return [[orderedDates[0], finalValue]];

  const series = [];
  const penultimateTarget = Number.isFinite(lastStepDelta)
    ? (finalValue - lastStepDelta)
    : finalValue;
  const clampedStart = clampAttributedCarryValue(startValue, finalValue);
  const headDates = orderedDates.slice(0, -1);

  if (headDates.length === 1) {
    series.push([headDates[0], clampedStart]);
  } else {
    const normalizedWeights = headDates.slice(1).map((_, index) => {
      const candidate = Number(weights[index]);
      return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
    });
    const totalWeight = normalizedWeights.reduce((sum, value) => sum + value, 0) || normalizedWeights.length || 1;
    let cumulativeWeight = 0;

    headDates.forEach((date, index) => {
      if (index === 0) {
        series.push([date, clampedStart]);
        return;
      }
      cumulativeWeight += normalizedWeights[index - 1] || 1;
      const progress = totalWeight ? (cumulativeWeight / totalWeight) : (index / Math.max(1, headDates.length - 1));
      const interpolated = clampedStart + ((penultimateTarget - clampedStart) * progress);
      series.push([date, clampAttributedCarryValue(interpolated, finalValue)]);
    });
  }

  series.push([orderedDates[orderedDates.length - 1], finalValue]);
  return series;
}

function buildTransferDeltaSeries(rawSeries, dates, effectiveDate, finalValue = null) {
  const orderedDates = Array.isArray(dates) ? dates : [];
  const points = Array.isArray(rawSeries)
    ? rawSeries.filter(([date, value]) => date && Number.isFinite(value))
    : [];
  if (!orderedDates.length) return [];
  if (!effectiveDate) return points;

  const baseline = getValueOnOrBefore(points, effectiveDate) ?? getFirstValueOnOrAfter(points, effectiveDate)?.[1] ?? 0;
  const targetFinal = Number.isFinite(finalValue)
    ? (finalValue - baseline)
    : (((points[points.length - 1]?.[1]) ?? 0) - baseline);

  return orderedDates.map((date) => {
    if (date <= effectiveDate) return [date, 0];
    const value = getValueOnOrBefore(points, date);
    if (!Number.isFinite(value)) return [date, 0];
    return [date, value - baseline];
  }).map(([date, value], index, arr) => (
    index === arr.length - 1 ? [date, targetFinal] : [date, value]
  ));
}

function normalizePriceBackedCarrySeries(series, finalValue) {
  const points = Array.isArray(series)
    ? series.filter(([date, value]) => date && Number.isFinite(value))
    : [];
  if (!points.length || !Number.isFinite(finalValue)) return [];

  const signalIndex = points.findIndex(([, value]) => (
    finalValue > 0 ? value > 0.0001 : value < -0.0001
  ));
  const firstSignalIndex = signalIndex >= 0 ? signalIndex : Math.max(0, points.length - 1);

  return points.map(([date, value], index) => {
    if (index < firstSignalIndex) return [date, 0];
    return [date, clampAttributedCarryValue(value, finalValue)];
  }).map(([date, value], index, arr) => (
    index === arr.length - 1 ? [date, finalValue] : [date, value]
  ));
}

function estimateAttributedPositionPnlSeries(position, dates, sourceHistory, priceSeries, {
  effectiveDate = null,
  futuresSnapshotSeries = [],
} = {}) {
  const currentPnl = getPositionPnlValue(position);
  if (!Number.isFinite(currentPnl) || !dates?.length || Math.abs(currentPnl) < 0.0001) return { series: [], method: 'none' };

  if (futuresSnapshotSeries?.length) {
    const rawSeries = expandHistoryToDates(futuresSnapshotSeries, dates);
    const series = buildTransferDeltaSeries(rawSeries, dates, effectiveDate, currentPnl);
    if (series.length) return { series, method: 'snapshot' };
  }

  const latestPriceFromSeries = priceSeries?.[priceSeries.length - 1]?.[1];
  const referencePrice = Number(position?.price);
  const scalePrice = Number.isFinite(referencePrice) && referencePrice !== 0
    ? referencePrice
    : (Number.isFinite(latestPriceFromSeries) && latestPriceFromSeries !== 0 ? latestPriceFromSeries : null);
  const qty = Number(position?.qty);
  const multiplier = getPositionEffectiveMultiplier(position);

  if (priceSeries?.length && Number.isFinite(scalePrice) && scalePrice !== 0 && Number.isFinite(qty) && qty !== 0 && Number.isFinite(multiplier) && multiplier !== 0) {
    const signedExposure = qty * multiplier;
    const explicitCostBasis = Number(position?.costBasis);
    const entryPrice = Number.isFinite(explicitCostBasis) && signedExposure !== 0
      ? (explicitCostBasis / signedExposure)
      : (scalePrice - (currentPnl / signedExposure));
    if (Number.isFinite(entryPrice)) {
      const rawSeries = dates
        .map((date) => {
          const price = getValueOnOrBefore(priceSeries, date);
          if (!Number.isFinite(price)) return null;
          return [date, signedExposure * (price - entryPrice)];
        })
        .filter(Boolean);
      const normalizedSeries = normalizePriceBackedCarrySeries(rawSeries, currentPnl);
      const series = buildTransferDeltaSeries(normalizedSeries, dates, effectiveDate, currentPnl);
      if (series.length) return { series, method: 'price' };
    }
  }

  if (sourceHistory?.length) {
    const rawSeries = buildMonotonicCarrySeries(
      dates,
      currentPnl,
      {
        weights: buildCarryWeightsFromSourceHistory(dates, sourceHistory),
        lastStepDelta: Number(position?.pnlDay),
      },
    );
    const series = buildTransferDeltaSeries(rawSeries, dates, effectiveDate, currentPnl);
    if (series.length) return { series, method: 'account' };
  }

  return {
    series: buildTransferDeltaSeries(buildMonotonicCarrySeries(dates, currentPnl), dates, effectiveDate, currentPnl),
    method: 'linear',
  };
}

function estimateAttributedRealizedTradeCarrySeries(trade, dates, sourceHistory, priceSeries) {
  if (!trade || !dates?.length) return { series: [], method: 'none' };

  const openedDate = normalizeDateInput(trade.openedDate) || normalizeDateInput(trade.closedDate) || dates[0];
  const closedDate = normalizeDateInput(trade.closedDate) || openedDate;
  const futureLike = isFutureLikeRealizedTrade(trade);
  const finalPnl = Number(trade.gain);
  if (!Number.isFinite(finalPnl) || Math.abs(finalPnl) < 0.0001) return { series: [], method: 'none' };

  const buildSeries = (resolveValue) => {
    const series = [];
    for (const date of dates) {
      if (date < openedDate) {
        series.push([date, 0]);
        continue;
      }
      if (date >= closedDate) {
        series.push([date, finalPnl]);
        continue;
      }
      const value = resolveValue(date);
      if (!Number.isFinite(value)) return [];
      series.push([date, value]);
    }
    return series;
  };

  const sourceFirst = sourceHistory?.[0]?.[1];
  const sourceClose = getValueOnOrBefore(sourceHistory, closedDate) ?? sourceHistory?.[sourceHistory.length - 1]?.[1];
  if (!futureLike && sourceHistory?.length && Number.isFinite(sourceFirst) && Number.isFinite(sourceClose) && sourceClose !== sourceFirst) {
    const series = buildSeries((date) => {
      const sourceValue = getValueOnOrBefore(sourceHistory, date);
      if (!Number.isFinite(sourceValue)) return NaN;
      const progress = (sourceValue - sourceFirst) / (sourceClose - sourceFirst);
      return finalPnl * progress;
    });
    if (series.length) return { series, method: 'account' };
  }

  const qty = Number(trade.qty);
  const closePrice = Number.isFinite(Number(trade.proceeds)) && Number.isFinite(qty) && qty !== 0
    ? Math.abs(Number(trade.proceeds) / qty)
    : (getValueOnOrBefore(priceSeries, closedDate) ?? priceSeries?.[priceSeries.length - 1]?.[1]);
  if (priceSeries?.length && Number.isFinite(closePrice) && closePrice !== 0 && Number.isFinite(qty) && qty !== 0) {
    const entryPrice = closePrice - (finalPnl / qty);
    if (Number.isFinite(entryPrice)) {
      const series = buildSeries((date) => {
        const price = getValueOnOrBefore(priceSeries, date);
        return Number.isFinite(price) ? qty * (price - entryPrice) : NaN;
      });
      if (series.length) return { series, method: 'price' };
    }
  }

  const openedTime = new Date(`${openedDate}T00:00:00Z`).getTime();
  const closedTime = new Date(`${closedDate}T00:00:00Z`).getTime();
  const span = Math.max(closedTime - openedTime, 86400000);
  return {
    series: buildSeries((date) => {
      const currentTime = new Date(`${date}T00:00:00Z`).getTime();
      const progress = Math.min(1, Math.max(0, (currentTime - openedTime) / span));
      return finalPnl * progress;
    }),
    method: 'linear',
  };
}

function buildPortfolioBenchmarkChartData(portfolioSeries, benchmarkSeries) {
  if (!portfolioSeries?.length) return [];

  const portfolioBase = portfolioSeries[0]?.[1];
  const benchmarkBase = benchmarkSeries?.[0]?.[1];
  if (!Number.isFinite(portfolioBase) || portfolioBase === 0) return [];

  const dates = [...new Set([
    ...portfolioSeries.map(([date]) => date),
    ...(benchmarkSeries || []).map(([date]) => date),
  ])].sort();

  let portfolioIndex = 0;
  let benchmarkIndex = 0;
  let lastPortfolio = null;
  let lastBenchmark = null;
  const firstPortfolioDate = portfolioSeries[0]?.[0] || null;
  const firstBenchmarkDate = benchmarkSeries?.[0]?.[0] || null;

  return dates
    .map((date) => {
      while (portfolioIndex < portfolioSeries.length && portfolioSeries[portfolioIndex][0] <= date) {
        lastPortfolio = portfolioSeries[portfolioIndex][1];
        portfolioIndex += 1;
      }
      while (benchmarkIndex < (benchmarkSeries?.length || 0) && benchmarkSeries[benchmarkIndex][0] <= date) {
        lastBenchmark = benchmarkSeries[benchmarkIndex][1];
        benchmarkIndex += 1;
      }

      const hasPortfolio = firstPortfolioDate && date >= firstPortfolioDate && Number.isFinite(lastPortfolio);
      const hasBenchmark = firstBenchmarkDate && date >= firstBenchmarkDate && Number.isFinite(lastBenchmark) && Number.isFinite(benchmarkBase) && benchmarkBase !== 0;
      if (!hasPortfolio && !hasBenchmark) return null;

      const portPct = hasPortfolio ? ((lastPortfolio - portfolioBase) / portfolioBase) * 100 : null;
      const spxPct = hasBenchmark ? ((lastBenchmark - benchmarkBase) / benchmarkBase) * 100 : null;

      return {
        date,
        nav: hasPortfolio ? lastPortfolio : null,
        portPct: Number.isFinite(portPct) ? parseFloat(portPct.toFixed(3)) : null,
        spxPct: Number.isFinite(spxPct) ? parseFloat(spxPct.toFixed(3)) : null,
      };
    })
    .filter(Boolean);
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

function isOptionPosition(position) {
  return String(position?.assetType || '').toLowerCase().includes('option');
}

function isFuturePosition(position) {
  return String(position?.assetType || '').toLowerCase().includes('future');
}

function isEtfPosition(position) {
  const assetType = String(position?.assetType || '').toLowerCase();
  return assetType.includes('etf') || Boolean(position?.isSectorETF);
}

function getPositionUnderlying(position) {
  return String(position?.baseSymbol || position?.overrideSymbol || position?.normalizedSymbol || position?.symbol || '')
    .trim()
    .toUpperCase();
}

function getPositionSnapshotKey(position) {
  const heldAccount = getPositionHeldAccount(position);
  const symbol = String(position?.symbol || position?.normalizedSymbol || '').trim().toUpperCase();
  const assetType = String(position?.assetType || '').trim().toUpperCase();
  return heldAccount && symbol ? `${heldAccount}::${symbol}::${assetType}` : '';
}

function getPositionHeldAccount(position) {
  return String(position?.custodyAccount || position?.account || '').trim();
}

function getPositionAttributedAccount(position, positionAttributionOverrides = {}) {
  const heldAccount = getPositionHeldAccount(position);
  const key = getPositionAttributionKey(position);
  return key ? (positionAttributionOverrides[key] || heldAccount) : heldAccount;
}

function getRealizedTradeAttributedAccount(
  trade,
  realizedTradeAttributionOverrides = {},
  positionAttributionOverrides = {},
) {
  const explicitOverride = getRealizedTradeExplicitAttributionOverride(trade, realizedTradeAttributionOverrides);
  if (explicitOverride) return explicitOverride;
  return getRealizedTradeInheritedAccount(trade, positionAttributionOverrides);
}

function getRealizedTradeAttributionSelectionValue(
  trade,
  realizedTradeAttributionOverrides = {},
  positionAttributionOverrides = {},
) {
  const heldAccount = normalizeAccountName(trade?.account);
  const explicitOverride = getRealizedTradeExplicitAttributionOverride(trade, realizedTradeAttributionOverrides);
  if (explicitOverride) return explicitOverride === heldAccount ? POSITION_ATTRIBUTION_HELD : explicitOverride;
  const inheritedAccount = getRealizedTradeInheritedAccount(trade, positionAttributionOverrides);
  return inheritedAccount && inheritedAccount !== heldAccount
    ? REALIZED_ATTRIBUTION_FOLLOW_POSITION
    : POSITION_ATTRIBUTION_HELD;
}

function getPositionDisplayAccount(position) {
  return String(position?.attributedAccount || getPositionHeldAccount(position) || '').trim();
}

function getRealizedTradeDisplayAccount(trade) {
  return String(trade?.attributedAccount || normalizeAccountName(trade?.account) || '').trim();
}

function getPositionAttributionKey(position) {
  const heldAccount = getPositionHeldAccount(position);
  const underlying = getPositionUnderlying(position);
  return heldAccount && underlying ? `${heldAccount}::${underlying}` : '';
}

function getFuturesSnapshotSeries(position, futuresPnlSnapshots = {}) {
  const snapshotKey = getPositionSnapshotKey(position);
  const snapshotMap = snapshotKey ? futuresPnlSnapshots?.[snapshotKey] : null;
  if (!snapshotMap) return [];
  return Object.entries(snapshotMap)
    .map(([date, pnl]) => [normalizeDateInput(date), Number(pnl)])
    .filter(([date, pnl]) => date && Number.isFinite(pnl))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function getPositionTransferEffectiveDate(position, positionTransferEffectiveDates = {}, futuresPnlSnapshots = {}) {
  const key = getPositionAttributionKey(position);
  const explicitDate = key ? normalizeDateInput(positionTransferEffectiveDates?.[key]) : null;
  if (explicitDate) return explicitDate;
  if (!isFuturePosition(position) && position?.source !== POSITION_SOURCE_FUTURES) return null;
  const snapshotSeries = getFuturesSnapshotSeries(position, futuresPnlSnapshots);
  return snapshotSeries[0]?.[0] || null;
}

function getPositionGroupKey(position, accountScope = 'ALL') {
  const underlying = getPositionUnderlying(position);
  const accountKey = accountScope === 'ALL' ? getPositionDisplayAccount(position).toUpperCase() : '';
  return `${accountKey}::${underlying}`;
}

function getPositionOverrideCandidates(position) {
  return [...new Set([
    position?.overrideSymbol,
    position?.symbol,
    position?.normalizedSymbol,
    position?.baseSymbol,
  ].filter(Boolean))];
}

function getPositionOverrideValue(position, sectorOverrides = {}) {
  const accountNames = [...new Set([
    position?.attributedAccount,
    getPositionHeldAccount(position),
  ].filter(Boolean))];
  for (const accountName of accountNames) {
    for (const symbol of getPositionOverrideCandidates(position)) {
      const value = sectorOverrides[getSectorOverrideKey(accountName, symbol)];
      if (value) return value;
    }
  }
  return SECTOR_OVERRIDE_AUTO;
}

function summarizeGroupedPositionTypes(rows) {
  const futureCount = rows.filter((row) => isFuturePosition(row) && !isOptionPosition(row)).length;
  const equityCount = rows.filter((row) => !isOptionPosition(row) && !isEtfPosition(row) && !isFuturePosition(row)).length;
  const etfCount = rows.filter((row) => isEtfPosition(row)).length;
  const optionCount = rows.filter((row) => isOptionPosition(row)).length;
  return [
    equityCount ? `${equityCount} ${equityCount === 1 ? 'Stock' : 'Stocks'}` : null,
    futureCount ? `${futureCount} ${futureCount === 1 ? 'Future' : 'Futures'}` : null,
    etfCount ? `${etfCount} ${etfCount === 1 ? 'ETF' : 'ETFs'}` : null,
    optionCount ? `${optionCount} ${optionCount === 1 ? 'Option Leg' : 'Option Legs'}` : null,
  ].filter(Boolean).join(' · ');
}

function formatPositionQty(qty) {
  if (!Number.isFinite(qty)) return '--';
  const decimals = Number.isInteger(qty) ? 0 : 2;
  return qty.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatShortAccountName(accountName) {
  const raw = String(accountName || '');
  return raw.split('...')[1] ? `...${raw.split('...')[1]}` : raw;
}

function summarizeAccountNames(accountNames = []) {
  const uniqueNames = [...new Set(accountNames.filter(Boolean))];
  if (!uniqueNames.length) return '--';
  if (uniqueNames.length === 1) return formatShortAccountName(uniqueNames[0]);
  return `${formatShortAccountName(uniqueNames[0])} +${uniqueNames.length - 1}`;
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

function isRenderHibernateWakeResponse(response, text = '') {
  if (!response) return false;
  const routing = response.headers?.get?.('x-render-routing') || '';
  const body = String(text || '').toLowerCase();
  return response.status === 503 && (
    routing.toLowerCase().includes('hibernate-wake-error')
    || body.includes('hibernate-wake-error')
  );
}

async function warmBenchmarkService() {
  try {
    await fetch('/health', { cache: 'no-store' });
  } catch {
    // Ignore wake-up probe failures; the caller will retry the real request.
  }
}

async function loadBenchmarkHistorySeries(symbol, { days = 3650, retries = 1, forceRefresh = false } = {}) {
  const stooqSymbol = toStooqSymbol(symbol);
  if (!stooqSymbol) throw new Error(`No benchmark data for ${symbol}`);
  const shouldRefresh = !!forceRefresh;
  const params = new URLSearchParams({
    s: stooqSymbol,
    i: 'd',
  });
  if (shouldRefresh) {
    params.set('refresh', '1');
    params.set('_ts', String(Date.now()));
  }
  const url = `/api/stooq/q/d/l/?${params.toString()}`;
  let lastError = null;
  const renderWakeRetries = symbol === '^GSPC' ? 12 : 6;
  const maxAttempts = Math.max(retries, renderWakeRetries);
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, { cache: shouldRefresh ? 'no-store' : 'default' });
      const text = await res.text();
      if (isRenderHibernateWakeResponse(res, text)) {
        await warmBenchmarkService();
        throw new Error(`Render wake in progress for ${symbol}`);
      }
      if (!res.ok || !text.startsWith("Date,")) throw new Error(`No benchmark data for ${symbol}`);
      return parseStooqHistory(text, days);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const pauseMs = attempt < 2 ? 1200 : Math.min(8000, 2000 + (attempt * 800));
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }
  }
  throw lastError || new Error(`No benchmark data for ${symbol}`);
}

function fmt$(n) { if (n===undefined||n===null||isNaN(n)) return '--'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n); }
function fmtPct(n,decimals=2) { if (n===undefined||n===null||isNaN(n)) return '--'; return `${n>=0?'+':''}${n.toFixed(decimals)}%`; }
function fmtNum(n,d=2) { if (n===undefined||n===null||isNaN(n)) return '--'; return n.toFixed(d); }
const CHART_TICK_STYLE = { fill:PALETTE.textDim, fontSize:10 };

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
    background:PALETTE.bg,
    color:PALETTE.text,
    fontFamily:"'IBM Plex Sans', 'IBM Plex Sans Condensed', 'Helvetica Neue', sans-serif",
    minHeight:'100vh',
    fontSize:'13px',
    padding:'22px',
    backgroundImage:[
      `radial-gradient(circle at top left, ${hexToRgba(PALETTE.accent, 0.11)}, transparent 26%)`,
      `radial-gradient(circle at top right, ${hexToRgba(PALETTE.steel, 0.08)}, transparent 32%)`,
      `radial-gradient(circle at bottom center, ${hexToRgba(PALETTE.brass, 0.05)}, transparent 28%)`,
      'linear-gradient(180deg, rgba(18, 21, 26, 0.98), rgba(6, 7, 9, 1))',
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 30px)',
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.01) 0, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 30px)',
    ].join(','),
  },
  screen: {
    maxWidth:'1680px',
    margin:'0 auto',
    background:'linear-gradient(180deg, rgba(20,23,28,0.99), rgba(8,10,12,1))',
    border:`1px solid ${PALETTE.border}`,
    borderRadius:'28px',
    boxShadow:'0 26px 72px rgba(0,0,0,0.52)',
    overflow:'hidden',
  },
  headerShell: {
    background:'linear-gradient(180deg, rgba(28,32,38,0.98), rgba(11,13,16,0.99))',
    borderBottom:`1px solid ${PALETTE.borderStrong}`,
  },
  header: {
    padding:'20px 24px 16px',
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:'20px',
    flexWrap:'wrap',
    borderBottom:`1px solid ${PALETTE.borderSubtle}`,
  },
  logo: {
    color:PALETTE.accentBright,
    fontWeight:700,
    fontSize:'19px',
    letterSpacing:'2.2px',
    textTransform:'uppercase',
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  headerMeta: { color:PALETTE.textMuted, fontSize:'11px', letterSpacing:'1.3px', textTransform:'uppercase' },
  statusPill: {
    background:'linear-gradient(180deg, rgba(44,49,56,0.96), rgba(15,17,20,0.96))',
    border:`1px solid ${PALETTE.border}`,
    color:PALETTE.text,
    padding:'8px 12px',
    borderRadius:'999px',
    fontSize:'10.5px',
    letterSpacing:'1px',
    textTransform:'uppercase',
    boxShadow:`0 10px 20px ${hexToRgba('#000000', 0.14)}`,
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  marketRibbon: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(144px, 1fr))',
    gap:'10px',
    padding:'14px 24px 20px',
  },
  marketTile: {
    background:'linear-gradient(180deg, rgba(31,35,40,0.96), rgba(10,12,14,0.96))',
    border:`1px solid ${PALETTE.borderSubtle}`,
    borderTop:`1px solid ${PALETTE.borderStrong}`,
    borderRadius:'18px',
    padding:'12px 14px',
    boxShadow:`inset 0 1px 0 ${hexToRgba('#ffffff', 0.03)}, 0 12px 24px rgba(0,0,0,0.16)`,
  },
  tabs: {
    display:'flex',
    gap:'10px',
    background:'linear-gradient(180deg, rgba(13,16,20,0.98), rgba(8,10,13,0.98))',
    borderBottom:`1px solid ${PALETTE.border}`,
    padding:'12px 22px 0',
    overflowX:'auto',
  },
  tab: {
    padding:'12px 16px',
    cursor:'pointer',
    color:PALETTE.textMuted,
    transition:'all .15s',
    fontWeight:700,
    fontSize:'10.5px',
    letterSpacing:'1.4px',
    textTransform:'uppercase',
    background:'linear-gradient(180deg, rgba(30,34,38,0.96), rgba(10,12,14,0.96))',
    border:`1px solid ${PALETTE.borderSubtle}`,
    borderBottom:'1px solid transparent',
    borderTopLeftRadius:'16px',
    borderTopRightRadius:'16px',
    marginTop:'0',
    minWidth:'fit-content',
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  tabActive: {
    color:PALETTE.accentBright,
    borderColor:PALETTE.borderStrong,
    borderBottomColor:PALETTE.bg,
    background:'linear-gradient(180deg, rgba(52,37,17,0.96), rgba(17,15,12,0.98))',
    boxShadow:`0 14px 28px ${hexToRgba('#000000', 0.18)}`,
  },
  selectorBar: {
    background:'linear-gradient(180deg, rgba(16,19,22,0.98), rgba(5,7,9,0.98))',
    borderBottom:`1px solid ${PALETTE.borderSubtle}`,
    padding:'14px 24px',
    display:'flex',
    gap:'10px',
    alignItems:'center',
    overflowX:'auto',
  },
  selectorLabel: { color:PALETTE.textDim, fontSize:'10.5px', letterSpacing:'1.3px', textTransform:'uppercase', marginRight:'8px', fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif" },
  card: {
    background:'linear-gradient(180deg, rgba(22,26,30,0.98), rgba(7,9,11,0.99))',
    border:`1px solid ${PALETTE.borderSubtle}`,
    borderRadius:'20px',
    padding:'18px 20px',
    boxShadow:'0 16px 36px rgba(0,0,0,0.22)',
  },
  cardTitle: {
    color:PALETTE.accentBright,
    fontSize:'10.5px',
    letterSpacing:'1.6px',
    textTransform:'uppercase',
    marginBottom:'10px',
    fontWeight:700,
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  positive: { color:PALETTE.positive },
  negative: { color:PALETTE.negative },
  neutral: { color:PALETTE.textStrong },
  grid: (cols) => {
    const minWidth = Math.min(280, Math.max(180, Math.floor(1120 / Math.max(cols, 1))));
    return { display:'grid', gridTemplateColumns:`repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap:'14px' };
  },
  section: { padding:'24px 24px 34px' },
  tableWrapper: {
    overflowX:'auto',
    overflowY:'hidden',
    border:`1px solid ${PALETTE.borderSubtle}`,
    background:'rgba(0,0,0,0.16)',
    borderRadius:'16px',
  },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'11px' },
  th: {
    padding:'11px 14px',
    textAlign:'left',
    color:PALETTE.accentBright,
    fontWeight:700,
    borderBottom:`1px solid ${PALETTE.borderStrong}`,
    fontSize:'9.5px',
    letterSpacing:'1.2px',
    textTransform:'uppercase',
    background:'linear-gradient(180deg, rgba(45,31,15,0.62), rgba(15,16,18,0.98))',
    whiteSpace:'nowrap',
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  td: {
    padding:'11px 14px',
    borderBottom:`1px solid ${PALETTE.borderSubtle}`,
    color:PALETTE.text,
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
    border:`1px solid ${PALETTE.border}`,
    color:PALETTE.text,
    padding:'8px 14px',
    borderRadius:'12px',
    cursor:'pointer',
    fontSize:'11px',
    fontWeight:700,
    letterSpacing:'1px',
    boxShadow:`0 8px 18px ${hexToRgba('#000000', 0.16)}`,
    fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif",
  },
  btnActive: {
    background:'linear-gradient(180deg, rgba(70,45,18,0.96), rgba(21,18,14,0.98))',
    border:`1px solid ${PALETTE.borderStrong}`,
    color:PALETTE.accentBright,
  },
  input: {
    background:'linear-gradient(180deg, rgba(14,17,20,0.96), rgba(7,9,11,0.98))',
    border:`1px solid ${PALETTE.border}`,
    color:PALETTE.textStrong,
    padding:'10px 12px',
    borderRadius:'12px',
    fontSize:'12px',
    width:'100%',
    boxSizing:'border-box',
    boxShadow:`inset 0 1px 0 ${hexToRgba('#ffffff', 0.03)}`,
    fontFamily:"'IBM Plex Sans', sans-serif",
  },
  uploadBox: {
    border:`1px dashed ${PALETTE.borderStrong}`,
    borderRadius:'18px',
    padding:'28px',
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

function signalPanelStyle(color = PALETTE.steel) {
  return {
    ...S.card,
    background:[
      `linear-gradient(180deg, ${hexToRgba(color, 0.1)}, rgba(7,9,11,0) 44%)`,
      'linear-gradient(180deg, rgba(22,26,30,0.98), rgba(6,8,10,0.99))',
    ].join(','),
    borderColor: hexToRgba(color, 0.18),
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
  if (clamped > 0) return `rgba(103, 168, 111, ${0.14 + Math.abs(clamped) * 0.34})`;
  return `rgba(199, 105, 92, ${0.14 + Math.abs(clamped) * 0.34})`;
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
    <div style={{ background:'linear-gradient(180deg, rgba(24,28,32,0.99), rgba(8,10,12,0.99))', border:`1px solid ${PALETTE.borderStrong}`, boxShadow:'0 10px 20px rgba(0,0,0,0.28)', padding:'10px 14px', borderRadius:'2px', fontSize:'11px' }}>
      <div style={{ color:PALETTE.accentBright, marginBottom:'6px', letterSpacing:'1px', textTransform:'uppercase', fontSize:'10px', fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom:'2px' }}>
          <span style={{color:PALETTE.textMuted}}>{p.name}: </span>
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
    positionAttributionOverrides: persisted.positionAttributionOverrides,
    realizedTradeAttributionOverrides: persisted.realizedTradeAttributionOverrides,
    positionTransferEffectiveDates: persisted.positionTransferEffectiveDates,
    futuresPnlSnapshots: persisted.futuresPnlSnapshots,
  }));
  const sharedStateSnapshotRef = useRef(buildSharedDashboardStatePayload({}));
  const workspaceStateRef = useRef(sharedSeedRef.current);
  const lastSharedStateSignatureRef = useRef(getSharedDashboardStateSignature(sharedStateSnapshotRef.current));
  const sharedStateVersionRef = useRef(0);
  const sharedStateUpdatedAtRef = useRef(null);
  const sharedStateDirtyRef = useRef(false);
  const sharedStateFetchInFlightRef = useRef(false);
  const sharedStateSaveInFlightRef = useRef(false);

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
  const [expandedPositionGroups, setExpandedPositionGroups] = useState({});
  const [selectedAccount, setSelectedAccount] = useState(persisted.selectedAccount || 'ALL');
  const [showBenchmark, setShowBenchmark] = useState(persisted.showBenchmark ?? true);
  const [selectedSector, setSelectedSector] = useState(persisted.selectedSector || SP500_SECTORS[0].name);
  const [riskMatrixMode, setRiskMatrixMode] = useState(persisted.riskMatrixMode || 'sectors');
  const [sectorTargetsByAccount, setSectorTargetsByAccount] = useState(sharedSeedRef.current.sectorTargetsByAccount);
  const [sectorOverrides, setSectorOverrides] = useState(sharedSeedRef.current.sectorOverrides);
  const [positionAttributionOverrides, setPositionAttributionOverrides] = useState(sharedSeedRef.current.positionAttributionOverrides);
  const [realizedTradeAttributionOverrides, setRealizedTradeAttributionOverrides] = useState(sharedSeedRef.current.realizedTradeAttributionOverrides);
  const [positionTransferEffectiveDates, setPositionTransferEffectiveDates] = useState(sharedSeedRef.current.positionTransferEffectiveDates);
  const [futuresPnlSnapshots, setFuturesPnlSnapshots] = useState(sharedSeedRef.current.futuresPnlSnapshots);
  const [performanceAccountingMode, setPerformanceAccountingMode] = useState(persisted.performanceAccountingMode || 'desk');
  const [performanceChartMode, setPerformanceChartMode] = useState(persisted.performanceChartMode || 'line');
  const [futuresStatementImportAccount, setFuturesStatementImportAccount] = useState(FUTURES_STATEMENT_ACCOUNT_AUTO);
  const [performanceChartSelection, setPerformanceChartSelection] = useState(() =>
    normalizePerformanceChartSelection(persisted.performanceChartSelection, [], persisted.showBenchmark ?? true),
  );
  const [legalNavPointsByAccount, setLegalNavPointsByAccount] = useState({});
  const [sharedStateReady, setSharedStateReady] = useState(false);
  const [sharedStateUpdatedAt, setSharedStateUpdatedAt] = useState(null);
  const [sharedSyncStatus, setSharedSyncStatus] = useState('Booting shared workspace');

  const setLocalWorkspaceState = useCallback((rawState) => {
    const normalized = buildSharedDashboardStatePayload(rawState);
    workspaceStateRef.current = normalized;
    setAccounts(normalized.accounts);
    setBalanceHistory(normalized.balanceHistory);
    setRealizedTrades(normalized.realizedTrades);
    setSectorTargetsByAccount(normalized.sectorTargetsByAccount);
    setSectorOverrides(normalized.sectorOverrides);
    setPositionAttributionOverrides(normalized.positionAttributionOverrides);
    setRealizedTradeAttributionOverrides(normalized.realizedTradeAttributionOverrides);
    setPositionTransferEffectiveDates(normalized.positionTransferEffectiveDates);
    setFuturesPnlSnapshots(normalized.futuresPnlSnapshots);
    return normalized;
  }, []);

  const commitSharedDashboardSnapshot = useCallback((rawState, updatedAt = null, version = 0, status = 'Shared workspace live') => {
    const normalized = buildSharedDashboardStatePayload(rawState);
    sharedStateSnapshotRef.current = normalized;
    lastSharedStateSignatureRef.current = getSharedDashboardStateSignature(normalized);
    sharedStateUpdatedAtRef.current = updatedAt || null;
    sharedStateVersionRef.current = Number.isFinite(Number(version)) ? Number(version) : 0;
    sharedStateDirtyRef.current = false;
    setSharedStateUpdatedAt(updatedAt || null);
    setSharedStateReady(true);
    setSharedSyncStatus(status);
    return normalized;
  }, []);

  const applySharedDashboardState = useCallback((rawState, updatedAt = null, version = 0, status = null) => {
    const normalized = commitSharedDashboardSnapshot(
      rawState,
      updatedAt,
      version,
      status || (updatedAt ? 'Shared workspace synced' : 'Shared workspace ready'),
    );
    setLocalWorkspaceState(normalized);
    return normalized;
  }, [commitSharedDashboardSnapshot, setLocalWorkspaceState]);

  const markSharedWorkspaceDirty = useCallback((status = 'Local edits pending sync') => {
    sharedStateDirtyRef.current = true;
    setSharedSyncStatus(status);
  }, []);

  useEffect(() => {
    workspaceStateRef.current = buildSharedDashboardStatePayload({
      accounts,
      balanceHistory,
      realizedTrades,
      sectorTargetsByAccount,
      sectorOverrides,
      positionAttributionOverrides,
      realizedTradeAttributionOverrides,
      positionTransferEffectiveDates,
      futuresPnlSnapshots,
    });
  }, [accounts, balanceHistory, futuresPnlSnapshots, positionAttributionOverrides, positionTransferEffectiveDates, realizedTradeAttributionOverrides, realizedTrades, sectorOverrides, sectorTargetsByAccount]);

  // Load SPX and sector ETF benchmarks using the proxied Stooq daily history feed.
  const loadBenchmarks = useCallback(async ({ forceRefresh = false, spxOnly = false } = {}) => {
    setSpxLoading(true);
    try {
      const cached = loadJSONStorage(MARKET_CACHE_STORAGE_KEY, null);
      if (!forceRefresh && cached?.spxData?.length) setSpxData(cached.spxData);
      if (!forceRefresh && cached?.sectorBenchmarkData) setSectorBenchmarkData(cached.sectorBenchmarkData);

      const requests = [
        { key: 'SPX', symbol: '^GSPC' },
        ...(spxOnly ? [] : SP500_SECTORS.map(({ name, etf }) => ({ key: name, symbol: etf }))),
      ];
      let nextSPXData = cached?.spxData || [];
      const nextSectorData = spxOnly ? (cached?.sectorBenchmarkData || {}) : {};

      for (const request of requests) {
        try {
          const series = await loadBenchmarkHistorySeries(request.symbol, { days: 3650, retries: 2, forceRefresh });
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

      if (!spxOnly) setSectorBenchmarkData(nextSectorData);
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

  useEffect(() => {
    const refreshSPX = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadBenchmarks({ forceRefresh: true, spxOnly: true });
    };

    const intervalId = window.setInterval(refreshSPX, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSPX();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadBenchmarks]);

  const requestSharedDashboardState = useCallback(async () => {
    const response = await fetch(SHARED_DASHBOARD_STATE_ENDPOINT, { cache:'no-store' });
    if (!response.ok) throw new Error(`Shared state fetch failed (${response.status})`);
    const payload = await response.json();
    return {
      payload,
      updatedAt: payload?.updated_at || null,
      version: Number.isFinite(Number(payload?.version)) ? Number(payload.version) : 0,
      state: buildSharedDashboardStatePayload(payload?.state || {}),
    };
  }, []);

  const fetchSharedDashboardState = useCallback(async ({ silent = false, preferLocalSeed = false } = {}) => {
    if (sharedStateFetchInFlightRef.current) return null;
    sharedStateFetchInFlightRef.current = true;
    if (!silent && !sharedStateDirtyRef.current) {
      setSharedSyncStatus(preferLocalSeed ? 'Loading shared workspace' : 'Refreshing shared workspace');
    }
    try {
      const remote = await requestSharedDashboardState();
      const updatedAt = remote.updatedAt;
      const remoteState = remote.state;
      const remoteHasContent = hasSharedDashboardStateContent(remoteState);
      const remoteSignature = getSharedDashboardStateSignature(remoteState);

      if ((remoteHasContent || !preferLocalSeed)
        && remoteSignature === lastSharedStateSignatureRef.current
        && updatedAt === sharedStateUpdatedAtRef.current
        && remote.version === sharedStateVersionRef.current) {
        setSharedStateReady(true);
        sharedStateUpdatedAtRef.current = updatedAt;
        setSharedStateUpdatedAt(updatedAt);
        if (!silent && !sharedStateDirtyRef.current) setSharedSyncStatus('Shared workspace live');
        return remote.payload;
      }

      if (sharedStateDirtyRef.current && remote.version !== sharedStateVersionRef.current) {
        setSharedStateReady(true);
        setSharedSyncStatus('Remote changes detected · local edits pending');
        return remote.payload;
      }

      if (remoteHasContent || !preferLocalSeed) {
        applySharedDashboardState(remoteState, updatedAt, remote.version);
      } else {
        commitSharedDashboardSnapshot(
          {},
          updatedAt,
          remote.version,
          hasSharedDashboardStateContent(sharedSeedRef.current)
            ? 'Shared workspace empty · local cache loaded'
            : 'Shared workspace ready',
        );
      }
      return remote.payload;
    } catch (error) {
      console.warn('Shared workspace fetch failed', error);
      setSharedStateReady(true);
      setSharedSyncStatus('Shared sync unavailable - local cache active');
      return null;
    } finally {
      sharedStateFetchInFlightRef.current = false;
    }
  }, [applySharedDashboardState, commitSharedDashboardSnapshot, requestSharedDashboardState]);

  useEffect(() => {
    fetchSharedDashboardState({ preferLocalSeed: true });
  }, [fetchSharedDashboardState]);

  useEffect(() => {
    if (!sharedStateReady) return undefined;
    let cancelled = false;
    let timeoutId = null;

    const schedule = () => {
      const jitter = Math.round((Math.random() - 0.5) * SHARED_DASHBOARD_POLL_JITTER_MS);
      timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          if (!sharedStateSaveInFlightRef.current) {
            await fetchSharedDashboardState({ silent: true, preferLocalSeed: false });
          }
        }
        schedule();
      }, Math.max(15000, SHARED_DASHBOARD_POLL_MS + jitter));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sharedStateSaveInFlightRef.current) {
        fetchSharedDashboardState({ silent: true, preferLocalSeed: false });
      }
    };

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchSharedDashboardState, sharedStateReady]);

  const saveSharedDashboardState = useCallback(async (statePayload, baseVersion, { allowMerge = true } = {}) => {
    sharedStateSaveInFlightRef.current = true;
    try {
      setSharedSyncStatus('Saving shared workspace');
      let response = await fetch(SHARED_DASHBOARD_STATE_ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ state: statePayload, base_version: baseVersion }),
      });

      if (response.status === 409 && allowMerge) {
        const latest = await requestSharedDashboardState();
        const { mergedState, conflicts } = mergeSharedDashboardStates(
          sharedStateSnapshotRef.current,
          statePayload,
          latest.state,
        );

        if (!conflicts.length && !deepEqualJSON(mergedState, latest.state)) {
          setLocalWorkspaceState(mergedState);
          sharedStateDirtyRef.current = true;
          setSharedSyncStatus('Merging remote workspace changes');
          response = await fetch(SHARED_DASHBOARD_STATE_ENDPOINT, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ state: mergedState, base_version: latest.version }),
          });
          if (!response.ok) throw new Error(`Shared state merged save failed (${response.status})`);
          const mergedResult = await response.json();
          commitSharedDashboardSnapshot(
            mergedResult?.state || mergedState,
            mergedResult?.updated_at || null,
            mergedResult?.version || (latest.version + 1),
            'Shared workspace live',
          );
          return true;
        }

        applySharedDashboardState(
          latest.state,
          latest.updatedAt,
          latest.version,
          conflicts.length
            ? 'Remote conflict detected · reloaded latest workspace'
            : 'Shared workspace synced',
        );
        return false;
      }

      if (!response.ok) throw new Error(`Shared state save failed (${response.status})`);
      const result = await response.json();
      commitSharedDashboardSnapshot(
        result?.state || statePayload,
        result?.updated_at || null,
        result?.version || (baseVersion + 1),
        'Shared workspace live',
      );
      return true;
    } catch (error) {
      console.warn('Shared workspace save failed', error);
      setSharedSyncStatus('Shared sync failed - local cache only');
      return false;
    } finally {
      sharedStateSaveInFlightRef.current = false;
    }
  }, [applySharedDashboardState, commitSharedDashboardSnapshot, requestSharedDashboardState, setLocalWorkspaceState]);

  useEffect(() => {
    if (!sharedStateReady) return undefined;

    const payload = workspaceStateRef.current;
    const signature = getSharedDashboardStateSignature(payload);

    if (signature === lastSharedStateSignatureRef.current) {
      sharedStateDirtyRef.current = false;
      return undefined;
    }
    if (!sharedStateDirtyRef.current || sharedStateSaveInFlightRef.current) return undefined;

    const timeoutId = window.setTimeout(async () => {
      if (signature === lastSharedStateSignatureRef.current || !sharedStateDirtyRef.current) return;
      await saveSharedDashboardState(payload, sharedStateVersionRef.current);
    }, SHARED_DASHBOARD_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [accounts, balanceHistory, futuresPnlSnapshots, positionAttributionOverrides, positionTransferEffectiveDates, realizedTradeAttributionOverrides, realizedTrades, saveSharedDashboardState, sectorOverrides, sectorTargetsByAccount, sharedStateReady]);

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
      positionAttributionOverrides,
      realizedTradeAttributionOverrides,
      positionTransferEffectiveDates,
      futuresPnlSnapshots,
      performanceAccountingMode,
      performanceChartMode,
      performanceChartSelection,
    });
  }, [timeframe, sectorTimeframe, realizedTimeframe, accounts, balanceHistory, futuresPnlSnapshots, realizedTrades, selectedAccount, showBenchmark, selectedSector, riskMatrixMode, sectorTargetsByAccount, sectorOverrides, positionAttributionOverrides, positionTransferEffectiveDates, realizedTradeAttributionOverrides, performanceAccountingMode, performanceChartMode, performanceChartSelection]);

  useEffect(() => {
    saveJSONStorage(SECURITY_HISTORY_STORAGE_KEY, securityHistoryData);
  }, [securityHistoryData]);

  const resetAllData = useCallback(() => {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Delete all uploaded accounts, balance history, realized trades, saved weights, and cached benchmark data?");
    if (!confirmed) return;

    markSharedWorkspaceDirty('Clearing shared workspace');
    setAccounts({});
    setBalanceHistory({});
    setRealizedTrades([]);
    setUploadStatus({});
    setSelectedAccount('ALL');
    setSectorTargetsByAccount({});
    setSectorOverrides({});
    setPositionAttributionOverrides({});
    setRealizedTradeAttributionOverrides({});
    setPositionTransferEffectiveDates({});
    setFuturesPnlSnapshots({});
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
  }, [markSharedWorkspaceDirty]);

  // File upload handlers
  const handlePositionsUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parsePositionsCSV(e.target.result);
        markSharedWorkspaceDirty('Positions upload pending sync');
        setAccounts((prev) => mergeStandardPositionAccounts(prev, parsed));
        setUploadStatus(s => ({ ...s, positions: `✓ ${Object.keys(parsed).length} accounts, ${Object.values(parsed).reduce((a,acc)=>a+acc.positions.length,0)} positions` }));
        loadBenchmarks({ forceRefresh: true, spxOnly: true });
      } catch(err) { setUploadStatus(s => ({ ...s, positions: `✗ Parse error: ${err.message}` })); }
    };
    reader.readAsText(file);
  }, [loadBenchmarks, markSharedWorkspaceDirty]);

  const handleFuturesStatementUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const knownAccounts = [...new Set([
          ...Object.keys(accounts || {}),
          ...Object.keys(balanceHistory || {}),
        ])].filter((name) => name && name !== 'ALL');
        const parsed = parseFuturesStatementCSV(e.target.result, {
          accountHint: file?.name,
          preferredAccount: futuresStatementImportAccount,
          existingAccountNames: knownAccounts,
          selectedAccount,
        });
        const realizedCount = parsed.realizedTrades?.length || 0;
        if (!parsed.importedCount && !realizedCount) {
          setUploadStatus((s) => ({
            ...s,
            futures: '✗ No futures rows found. Use a Schwab account statement CSV that includes Futures, Futures Options, or Profits and Losses sections.',
          }));
          return;
        }
        markSharedWorkspaceDirty('Futures statement upload pending sync');
        setAccounts((prev) => mergeSupplementalFuturesAccounts(prev, parsed.accounts));
        setFuturesPnlSnapshots((prev) => mergeFuturesPnlSnapshots(prev, parsed.futuresPnlSnapshots));
        if (realizedCount) {
          setRealizedTrades((prev) => mergeImportedRealizedTrades(prev, parsed.realizedTrades));
        }
        const importedParts = [];
        if (parsed.importedCount) importedParts.push(`${parsed.importedCount} live futures lines`);
        if (realizedCount) importedParts.push(`${realizedCount} realized futures rows`);
        setUploadStatus((s) => ({
          ...s,
          futures: `✓ ${importedParts.join(' + ')} imported to ${formatShortAccountName(parsed.accountName)} (${parsed.statementDate})`,
        }));
      } catch (err) {
        setUploadStatus((s) => ({ ...s, futures: `✗ Parse error: ${err.message}` }));
      }
    };
    reader.readAsText(file);
  }, [accounts, balanceHistory, futuresStatementImportAccount, markSharedWorkspaceDirty, selectedAccount]);

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
      markSharedWorkspaceDirty('Balance history upload pending sync');

      if (parsedResults.length === 1) {
        const { account, data } = parsedResults[0];
        setUploadStatus((s) => ({
          ...s,
          balances: `✓ ${account}: ${data.length} rows (${data[0]?.[0]} – ${data[data.length - 1]?.[0]})`,
        }));
        loadBenchmarks({ forceRefresh: true, spxOnly: true });
        return;
      }

      const accountCount = new Set(parsedResults.map(({ account }) => account)).size;
      const totalRows = parsedResults.reduce((sum, { data }) => sum + (data?.length || 0), 0);
      setUploadStatus((s) => ({
        ...s,
        balances: `✓ ${files.length} balance files loaded · ${accountCount} accounts · ${totalRows} rows`,
      }));
      loadBenchmarks({ forceRefresh: true, spxOnly: true });
    } catch (err) {
      setUploadStatus((s) => ({ ...s, balances: `✗ Parse error: ${err.message}` }));
    }
  }, [loadBenchmarks, markSharedWorkspaceDirty]);

  const handleRealizedUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const trades = parseRealizedCSV(e.target.result);
        markSharedWorkspaceDirty('Realized trades upload pending sync');
        setRealizedTrades(trades);
        const accountCount = new Set(trades.map(t => t.account)).size;
        setUploadStatus(s => ({
          ...s,
          realized: trades.length
            ? `✓ ${trades.length} trades across ${accountCount} accounts`
            : '✗ No realized lot rows found. Use the "Realized Gain/Loss - Lot Details" CSV export.',
        }));
        loadBenchmarks({ forceRefresh: true, spxOnly: true });
      } catch(err) { setUploadStatus(s => ({ ...s, realized: `✗ Parse error: ${err.message}` })); }
    };
    reader.readAsText(file);
  }, [loadBenchmarks, markSharedWorkspaceDirty]);

  // Derived: account list
  const accountList = useMemo(() => {
    const fromPositions = Object.keys(accounts);
    const fromBalances = Object.keys(balanceHistory);
    const fromRealized = realizedTrades.map((trade) => normalizeAccountName(trade?.account)).filter(Boolean);
    const fromPositionOverrides = Object.values(positionAttributionOverrides || {}).filter(Boolean);
    const fromRealizedOverrides = Object.values(realizedTradeAttributionOverrides || {}).filter(Boolean);
    const all = [...new Set([
      ...fromPositions,
      ...fromBalances,
      ...fromRealized,
      ...fromPositionOverrides,
      ...fromRealizedOverrides,
    ])].filter(k=>k!=='ALL');
    return all;
  }, [accounts, balanceHistory, positionAttributionOverrides, realizedTradeAttributionOverrides, realizedTrades]);
  const latestBalanceSnapshotDate = useMemo(
    () => getLatestSeriesDate(Object.values(balanceHistory || {})),
    [balanceHistory],
  );

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

  useEffect(() => {
    if (!sharedStateReady) return;
    const migration = migrateLegacyFuturesClearingAccount(accounts, sectorOverrides, positionAttributionOverrides);
    if (!migration.migrated) return;
    markSharedWorkspaceDirty(`Migrating futures held account to ${formatShortAccountName(migration.targetAccount)}`);
    setAccounts(migration.accounts);
    setSectorOverrides(migration.sectorOverrides);
    setPositionAttributionOverrides(migration.positionAttributionOverrides);
    if (selectedAccount === FUTURES_CLEARING_ACCOUNT) setSelectedAccount(migration.targetAccount || 'ALL');
  }, [accounts, markSharedWorkspaceDirty, positionAttributionOverrides, sectorOverrides, selectedAccount, sharedStateReady]);

  useEffect(() => {
    let cancelled = false;
    const targets = [...new Set(['ALL', ...accountList])];
    if (!targets.length) {
      setLegalNavPointsByAccount({});
      return undefined;
    }

    (async () => {
      try {
        const rows = await Promise.all(
          targets.map(async (accountName) => {
            const response = await api.get('/portfolio/nav', {
              params: {
                limit: 2000,
                ...(accountName === 'ALL' ? {} : { account: accountName }),
                _ts: Date.now(),
              },
              headers: { 'Cache-Control': 'no-cache' },
            });
            return [accountName, Array.isArray(response.data) ? response.data : []];
          }),
        );
        if (!cancelled) setLegalNavPointsByAccount(Object.fromEntries(rows));
      } catch (error) {
        console.warn('Legal NAV fetch failed for performance charts', error);
        if (!cancelled) setLegalNavPointsByAccount({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountList, sharedStateUpdatedAt]);

  const selectedAccountsData = useMemo(
    () => (selectedAccount === 'ALL' ? Object.values(accounts) : [accounts[selectedAccount]].filter(Boolean)),
    [accounts, selectedAccount],
  );

  const allPositions = useMemo(
    () => Object.values(accounts).flatMap((accountData) => accountData?.positions || []),
    [accounts],
  );

  const selectedPositions = useMemo(
    () => allPositions
      .map((position) => {
        const custodyAccount = getPositionHeldAccount(position);
        const attributedAccount = getPositionAttributedAccount(position, positionAttributionOverrides);
        if (selectedAccount !== 'ALL' && attributedAccount !== selectedAccount) return null;

        const enrichedPosition = {
          ...position,
          custodyAccount,
          attributedAccount,
        };
        const override = getPositionOverrideValue(enrichedPosition, sectorOverrides);
        const assignedSector = override && override !== SECTOR_OVERRIDE_AUTO
          ? override
          : (position.mainSector || UNCLASSIFIED_SECTOR);
        const mainSector = ALL_SECTOR_SET.has(assignedSector) ? assignedSector : null;
        return {
          ...enrichedPosition,
          sector: assignedSector,
          mainSector,
          isSectorETF: !!(mainSector && SECTOR_TO_ETF[mainSector] && position.cleanSym === SECTOR_TO_ETF[mainSector]),
        };
      })
      .filter(Boolean),
    [allPositions, positionAttributionOverrides, sectorOverrides, selectedAccount],
  );

  const transferredPositions = useMemo(
    () => allPositions
      .map((position) => ({
        ...position,
        custodyAccount: getPositionHeldAccount(position),
        attributedAccount: getPositionAttributedAccount(position, positionAttributionOverrides),
      }))
      .filter((position) => {
        const custodyAccount = getPositionHeldAccount(position);
        const attributedAccount = getPositionDisplayAccount(position);
        return custodyAccount && attributedAccount && custodyAccount !== attributedAccount && Number.isFinite(Number(position?.mktVal));
      }),
    [allPositions, positionAttributionOverrides],
  );

  const transferredRealizedTrades = useMemo(
    () => realizedTrades
      .map((trade) => {
        const custodyAccount = normalizeAccountName(trade.account);
        const inheritedAccount = getRealizedTradeInheritedAccount(trade, positionAttributionOverrides);
        const attributedAccount = getRealizedTradeAttributedAccount(
          trade,
          realizedTradeAttributionOverrides,
          positionAttributionOverrides,
        );
        return {
          ...trade,
          custodyAccount,
          inheritedAccount,
          attributedAccount,
        };
      })
      .filter((trade) => {
        const heldAccount = normalizeAccountName(trade.account);
        return heldAccount && trade.attributedAccount && heldAccount !== trade.attributedAccount;
      }),
    [positionAttributionOverrides, realizedTradeAttributionOverrides, realizedTrades],
  );

  const selectedRealizedTrades = useMemo(
    () => realizedTrades
      .map((trade) => {
        const custodyAccount = normalizeAccountName(trade.account);
        const inheritedAccount = getRealizedTradeInheritedAccount(trade, positionAttributionOverrides);
        const attributedAccount = getRealizedTradeAttributedAccount(
          trade,
          realizedTradeAttributionOverrides,
          positionAttributionOverrides,
        );
        if (selectedAccount !== 'ALL' && attributedAccount !== selectedAccount) return null;
        const { key: tradeOverrideKey, value: tradeSectorOverride, keys: tradeOverrideKeys } = getRealizedTradeOverrideMatch(trade, sectorOverrides);
        const override = tradeSectorOverride
          || sectorOverrides[getSectorOverrideKey(attributedAccount, trade.baseSym)]
          || sectorOverrides[getSectorOverrideKey(attributedAccount, trade.symbol)]
          || sectorOverrides[getSectorOverrideKey(custodyAccount, trade.baseSym)]
          || sectorOverrides[getSectorOverrideKey(custodyAccount, trade.symbol)];
        const assignedSector = override && override !== SECTOR_OVERRIDE_AUTO
          ? override
          : (trade.mainSector || UNCLASSIFIED_SECTOR);
        return {
          ...trade,
          custodyAccount,
          inheritedAccount,
          attributedAccount,
          tradeOverrideKeys,
          tradeOverrideKey,
          tradeSectorOverride,
          sector: assignedSector,
          mainSector: ALL_SECTOR_SET.has(assignedSector) ? assignedSector : null,
        };
      })
      .filter(Boolean),
    [positionAttributionOverrides, realizedTradeAttributionOverrides, realizedTrades, selectedAccount, sectorOverrides],
  );

  const selectedRealizedTradesWithDates = useMemo(
    () => selectedRealizedTrades.map((trade) => ({
      ...trade,
      openedDateISO: normalizeDateInput(trade.openedDate),
      closedDateISO: normalizeDateInput(trade.closedDate),
    })),
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

  const getSuggestedPositionTransferDate = useCallback((positionInput) => {
    const positions = Array.isArray(positionInput) ? positionInput : [positionInput];
    let latestSnapshotDate = null;
    positions.forEach((position) => {
      const snapshotSeries = getFuturesSnapshotSeries(position, futuresPnlSnapshots);
      const candidate = snapshotSeries[snapshotSeries.length - 1]?.[0] || null;
      if (candidate && (!latestSnapshotDate || candidate > latestSnapshotDate)) latestSnapshotDate = candidate;
    });
    return latestSnapshotDate || latestBalanceSnapshotDate || todayIsoLocal();
  }, [futuresPnlSnapshots, latestBalanceSnapshotDate]);

  const selectedPerformanceAccounts = useMemo(
    () => accountList.filter((accountName) => performanceChartSelection.accounts?.[accountName]),
    [accountList, performanceChartSelection],
  );
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

  const comparisonEndDate = useMemo(
    () => getLatestSeriesDate([activeHistory, spxData]),
    [activeHistory, spxData],
  );
  const filteredHistory = useMemo(
    () => filterByTimeframe(activeHistory, timeframe, comparisonEndDate),
    [activeHistory, timeframe, comparisonEndDate],
  );
  const filteredSPX = useMemo(
    () => filterByTimeframe(spxData, timeframe, comparisonEndDate),
    [spxData, timeframe, comparisonEndDate],
  );
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
    for (const position of [...selectedPositions, ...transferredPositions]) {
      if (!position.mainSector || position.isSectorETF || !position.historySymbol) continue;
      const key = getSecurityHistoryCacheKey(position.historySymbol);
      if (!key || symbolMap.has(key)) continue;
      symbolMap.set(key, position.historySymbol);
    }
    for (const trade of transferredRealizedTrades) {
      const historySymbol = trade.baseSym || trade.symbol;
      if (!historySymbol || FUTURES_ROOT_TO_SECTOR[getFutureRootSymbol(historySymbol)]) continue;
      const key = getSecurityHistoryCacheKey(historySymbol);
      if (!key || symbolMap.has(key)) continue;
      symbolMap.set(key, historySymbol);
    }
    return [...symbolMap.entries()].map(([key, symbol]) => ({ key, symbol }));
  }, [selectedPositions, transferredPositions, transferredRealizedTrades]);

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

  const getPositionHistorySeries = useCallback((position) => {
    if (!position?.mainSector) return [];
    if (position.isSectorETF && position.mainSector && SECTOR_TO_ETF[position.mainSector]) {
      return sectorBenchmarkData[position.mainSector] || [];
    }
    const cacheKey = getSecurityHistoryCacheKey(position.historySymbol || position.symbol);
    return cacheKey ? (securityHistoryData[cacheKey] || []) : [];
  }, [sectorBenchmarkData, securityHistoryData]);

  const getRealizedTradeHistorySeries = useCallback((trade) => {
    const historySymbol = trade?.baseSym || trade?.symbol;
    const cacheKey = getSecurityHistoryCacheKey(historySymbol);
    return cacheKey ? (securityHistoryData[cacheKey] || []) : [];
  }, [securityHistoryData]);

  const legalPerformanceModelsByAccount = useMemo(
    () => Object.fromEntries(
      accountList.map((accountName) => [
        accountName,
        buildPerformanceModelFromNavPoints(legalNavPointsByAccount[accountName], balanceHistory[accountName] || []),
      ]),
    ),
    [accountList, balanceHistory, legalNavPointsByAccount],
  );

  const legalAggregatePerformanceModel = useMemo(
    () => buildAggregatePerformanceModel(
      legalPerformanceModelsByAccount,
      selectedPerformanceAccounts.length ? selectedPerformanceAccounts : accountList,
    ),
    [accountList, legalPerformanceModelsByAccount, selectedPerformanceAccounts],
  );

  const legalActivePerformanceModel = useMemo(() => {
    if (selectedAccount === 'ALL') {
      return buildAggregatePerformanceModel(legalPerformanceModelsByAccount, accountList);
    }
    return legalPerformanceModelsByAccount[selectedAccount] || buildPerformanceModelFromNavPoints([], balanceHistory[selectedAccount] || []);
  }, [accountList, balanceHistory, legalPerformanceModelsByAccount, selectedAccount]);

  const deskPerformanceModel = useMemo(() => {
    const globalDates = [...new Set(
      Object.values(legalPerformanceModelsByAccount || {}).flatMap((model) => model?.navSeries?.map(([date]) => date) || []),
    )].sort();
    if (!globalDates.length || (!transferredPositions.length && !transferredRealizedTrades.length)) {
      return {
        accountModels: legalPerformanceModelsByAccount,
        aggregateModel: legalAggregatePerformanceModel,
        activeModel: legalActivePerformanceModel,
        transferCount: transferredPositions.length + transferredRealizedTrades.length,
        openTransferCount: transferredPositions.length,
        closedTransferCount: transferredRealizedTrades.length,
        snapshotBackedCount: 0,
        priceBackedCount: 0,
        accountBackedCount: 0,
        linearCount: 0,
        flatCount: 0,
      };
    }

    const historyAccounts = [...new Set([
      ...accountList,
      ...Object.keys(legalPerformanceModelsByAccount || {}),
      ...transferredPositions.flatMap((position) => [getPositionHeldAccount(position), getPositionDisplayAccount(position)]),
      ...transferredRealizedTrades.flatMap((trade) => [normalizeAccountName(trade.account), getRealizedTradeDisplayAccount(trade)]),
    ])].filter(Boolean);

    const expandedBaseByAccount = Object.fromEntries(
      historyAccounts.map((accountName) => [
        accountName,
        expandHistoryToDates(legalPerformanceModelsByAccount[accountName]?.navSeries || [], globalDates),
      ]),
    );
    const valueMaps = Object.fromEntries(
      historyAccounts.map((accountName) => [accountName, new Map(expandedBaseByAccount[accountName].map(([date, value]) => [date, value]))]),
    );
    const flowMaps = Object.fromEntries(
      historyAccounts.map((accountName) => [
        accountName,
        new Map((legalPerformanceModelsByAccount[accountName]?.flowSeries || []).map(([date, value]) => [date, value])),
      ]),
    );

    let snapshotBackedCount = 0;
    let priceBackedCount = 0;
    let accountBackedCount = 0;
    let linearCount = 0;
    let flatCount = 0;

    transferredPositions.forEach((position) => {
      const heldAccount = getPositionHeldAccount(position);
      const targetAccount = getPositionDisplayAccount(position);
      if (!heldAccount || !targetAccount || heldAccount === targetAccount) return;

      const sourceHistory = expandedBaseByAccount[heldAccount] || [];
      const effectiveDate = getPositionTransferEffectiveDate(position, positionTransferEffectiveDates, futuresPnlSnapshots);
      const { series, method } = estimateAttributedPositionPnlSeries(
        position,
        globalDates,
        sourceHistory,
        getPositionHistorySeries(position),
        {
          effectiveDate,
          futuresSnapshotSeries: getFuturesSnapshotSeries(position, futuresPnlSnapshots),
        },
      );

      if (!series.length) return;
      if (method === 'snapshot') snapshotBackedCount += 1;
      else if (method === 'price') priceBackedCount += 1;
      else if (method === 'account') accountBackedCount += 1;
      else if (method === 'linear') linearCount += 1;
      else flatCount += 1;

      series.forEach(([date, value]) => {
        valueMaps[heldAccount].set(date, (valueMaps[heldAccount].get(date) || 0) - value);
        if (!valueMaps[targetAccount]) valueMaps[targetAccount] = new Map(globalDates.map((historyDate) => [historyDate, 0]));
        valueMaps[targetAccount].set(date, (valueMaps[targetAccount].get(date) || 0) + value);
      });
    });

    transferredRealizedTrades.forEach((trade) => {
      const heldAccount = normalizeAccountName(trade.account);
      const targetAccount = getRealizedTradeDisplayAccount(trade);
      if (!heldAccount || !targetAccount || heldAccount === targetAccount) return;

      const sourceHistory = expandedBaseByAccount[heldAccount] || [];
      const { series, method } = estimateAttributedRealizedTradeCarrySeries(
        trade,
        globalDates,
        sourceHistory,
        getRealizedTradeHistorySeries(trade),
      );

      if (!series.length) return;
      if (method === 'price') priceBackedCount += 1;
      else if (method === 'account') accountBackedCount += 1;
      else if (method === 'linear') linearCount += 1;
      else flatCount += 1;

      series.forEach(([date, value]) => {
        valueMaps[heldAccount].set(date, (valueMaps[heldAccount].get(date) || 0) - value);
        if (!valueMaps[targetAccount]) valueMaps[targetAccount] = new Map(globalDates.map((historyDate) => [historyDate, 0]));
        valueMaps[targetAccount].set(date, (valueMaps[targetAccount].get(date) || 0) + value);
      });
    });

    const accountModels = Object.fromEntries(
      historyAccounts.map((accountName) => {
        const navSeries = globalDates.map((date) => [date, parseFloat(((valueMaps[accountName]?.get(date) || 0)).toFixed(4))]);
        const flowSeries = globalDates.map((date) => [date, parseFloat(((flowMaps[accountName]?.get(date) || 0)).toFixed(4))]);
        let previousNav = null;
        let cumulative = 1;
        const twrSeries = globalDates.map((date, index) => {
          const nav = navSeries[index]?.[1] || 0;
          const flow = flowSeries[index]?.[1] || 0;
          if (previousNav !== null && Number.isFinite(previousNav) && previousNav !== 0) {
            const dayReturn = (nav - previousNav - flow) / previousNav;
            if (Number.isFinite(dayReturn)) cumulative *= (1 + dayReturn);
          } else {
            cumulative = 1;
          }
          previousNav = nav;
          return [date, cumulative];
        });
        return [accountName, {
          navSeries,
          flowSeries,
          twrSeries,
          hasFlowAdjustedReturns: historyAccounts.every((name) => legalPerformanceModelsByAccount[name]?.hasFlowAdjustedReturns !== false),
        }];
      }),
    );

    return {
      accountModels,
      aggregateModel: buildAggregatePerformanceModel(
        accountModels,
        selectedPerformanceAccounts.length ? selectedPerformanceAccounts : accountList,
      ),
      activeModel: selectedAccount === 'ALL'
        ? buildAggregatePerformanceModel(accountModels, accountList)
        : (accountModels[selectedAccount] || { navSeries: [], twrSeries: [], flowSeries: [], hasFlowAdjustedReturns: false }),
      transferCount: transferredPositions.length + transferredRealizedTrades.length,
      openTransferCount: transferredPositions.length,
      closedTransferCount: transferredRealizedTrades.length,
      snapshotBackedCount,
      priceBackedCount,
      accountBackedCount,
      linearCount,
      flatCount,
    };
  }, [accountList, futuresPnlSnapshots, getPositionHistorySeries, getRealizedTradeHistorySeries, legalActivePerformanceModel, legalAggregatePerformanceModel, legalPerformanceModelsByAccount, positionTransferEffectiveDates, selectedAccount, selectedPerformanceAccounts, transferredPositions, transferredRealizedTrades]);

  const performanceModelSource = useMemo(
    () => (performanceAccountingMode === 'desk'
      ? {
          accountModels: deskPerformanceModel.accountModels || legalPerformanceModelsByAccount,
          aggregateModel: deskPerformanceModel.aggregateModel || legalAggregatePerformanceModel,
          activeModel: deskPerformanceModel.activeModel || legalActivePerformanceModel,
        }
      : {
          accountModels: legalPerformanceModelsByAccount,
          aggregateModel: legalAggregatePerformanceModel,
          activeModel: legalActivePerformanceModel,
        }),
    [deskPerformanceModel.accountModels, deskPerformanceModel.activeModel, deskPerformanceModel.aggregateModel, legalActivePerformanceModel, legalAggregatePerformanceModel, legalPerformanceModelsByAccount, performanceAccountingMode],
  );

  const performanceActiveHistory = performanceModelSource.activeModel?.navSeries || [];
  const performanceActiveReturnSeries = performanceModelSource.activeModel?.twrSeries || [];
  const selectedAggregateHistory = performanceModelSource.aggregateModel?.navSeries || [];
  const selectedAggregateReturnSeries = performanceModelSource.aggregateModel?.twrSeries || [];

  const performanceWindowEndDate = useMemo(() => {
    const candidateSeries = [];
    if (performanceChartSelection.aggregate && selectedAggregateReturnSeries.length) candidateSeries.push(selectedAggregateReturnSeries);
    selectedPerformanceAccounts.forEach((accountName) => {
      const history = performanceModelSource.accountModels?.[accountName]?.twrSeries;
      if (history?.length) candidateSeries.push(history);
    });
    if (performanceChartSelection.spx && spxData.length) candidateSeries.push(spxData);
    return getLatestSeriesDate(candidateSeries);
  }, [performanceChartSelection, performanceModelSource.accountModels, selectedAggregateReturnSeries, selectedPerformanceAccounts, spxData]);

  const performanceComparisonEndDate = useMemo(
    () => getLatestSeriesDate([performanceActiveHistory, spxData]),
    [performanceActiveHistory, spxData],
  );

  const performanceFilteredHistory = useMemo(
    () => filterByTimeframe(performanceActiveHistory, timeframe, performanceComparisonEndDate),
    [performanceActiveHistory, timeframe, performanceComparisonEndDate],
  );
  const performanceFilteredReturnSeries = useMemo(
    () => filterByTimeframe(performanceActiveReturnSeries, timeframe, performanceComparisonEndDate),
    [performanceActiveReturnSeries, timeframe, performanceComparisonEndDate],
  );

  const performanceSeriesDefinitions = useMemo(() => {
    const definitions = [];

    if (performanceChartSelection.aggregate && selectedAggregateReturnSeries.length) {
      definitions.push({
        key: '__portfolio__',
        label: 'Aggregate Portfolio',
        color: PALETTE.portfolio,
        strokeWidth: 2.25,
        data: filterByTimeframe(selectedAggregateReturnSeries, timeframe, performanceWindowEndDate),
      });
    }

    accountList.forEach((accountName, accountIndex) => {
      if (!performanceChartSelection.accounts?.[accountName]) return;
      const history = performanceModelSource.accountModels?.[accountName]?.twrSeries || [];
      if (!history.length) return;
      definitions.push({
        key: getPerformanceSeriesKey(accountName, accountIndex),
        label: accountName,
        color: accountColorMap[accountName] || '#e0e0e0',
        strokeWidth: selectedAccount === accountName ? 2.5 : 1.8,
        data: filterByTimeframe(history, timeframe, performanceWindowEndDate),
      });
    });

    if (performanceChartSelection.spx && spxData.length) {
      definitions.push({
        key: '__spx__',
        label: 'SPX',
        color: PALETTE.benchmark,
        strokeWidth: 1.6,
        strokeDasharray: '5 3',
        data: filterByTimeframe(spxData, timeframe, performanceWindowEndDate),
      });
    }

    return definitions.filter((series) => series.data.length);
  }, [performanceChartSelection, selectedAggregateReturnSeries, accountList, performanceModelSource.accountModels, accountColorMap, selectedAccount, spxData, timeframe, performanceWindowEndDate]);

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

  const performanceBarData = useMemo(
    () => performanceSeriesSummary.map((series) => ({
      key: series.key,
      label: series.label === 'Aggregate Portfolio'
        ? 'Aggregate'
        : series.label === 'SPX'
          ? 'SPX'
          : formatShortAccountName(series.label),
      fullLabel: series.label,
      value: Number.isFinite(series.periodReturn) ? series.periodReturn : 0,
      color: series.color,
    })),
    [performanceSeriesSummary],
  );

  // Merge portfolio + SPX for chart
  const chartData = useMemo(() => {
    return buildPortfolioBenchmarkChartData(filteredHistory, filteredSPX);
  }, [filteredHistory, filteredSPX]);

  const stats = useMemo(() => filteredHistory.length >= 2 ? computeReturns(filteredHistory) : null, [filteredHistory]);
  const allTimeStats = useMemo(() => activeHistory.length >= 2 ? computeReturns(activeHistory) : null, [activeHistory]);
  const performanceStats = useMemo(
    () => buildReturnStatsFromSeries(
      performanceFilteredReturnSeries,
      performanceFilteredHistory,
    ),
    [performanceFilteredHistory, performanceFilteredReturnSeries],
  );

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

  const positionsDisplay = useMemo(() => {
    const grouped = new Map();
    selectedPositions.forEach((position) => {
      const underlying = getPositionUnderlying(position);
      if (!underlying) return;
      const groupKey = getPositionGroupKey(position, selectedAccount);
      if (!grouped.has(groupKey)) grouped.set(groupKey, []);
      grouped.get(groupKey).push(position);
    });

    const groups = [...grouped.entries()]
      .map(([groupKey, rows]) => {
        const orderedRows = [...rows].sort((a, b) => {
          const rank = (row) => {
            if (isEtfPosition(row)) return 0;
            if (isFuturePosition(row) && !isOptionPosition(row)) return 1;
            if (!isOptionPosition(row)) return 2;
            return 3;
          };
          const rankDiff = rank(a) - rank(b);
          if (rankDiff !== 0) return rankDiff;
          return String(a.symbol || '').localeCompare(String(b.symbol || ''));
        });
        const first = orderedRows[0];
        const stockLikeRows = orderedRows.filter((row) => !isOptionPosition(row));
        const primaryRow = stockLikeRows[0] || first;
        const totalMarketValue = orderedRows.reduce((sum, row) => sum + (Number(row.mktVal) || 0), 0);
        const totalCostBasis = orderedRows.reduce((sum, row) => sum + (Number(row.costBasis) || 0), 0);
        const groupSector = orderedRows.every((row) => row.sector === orderedRows[0]?.sector)
          ? orderedRows[0]?.sector
          : 'Mixed';
        const heldAccounts = [...new Set(orderedRows.map((row) => getPositionHeldAccount(row)).filter(Boolean))];
        const attributedAccountName = getPositionDisplayAccount(first);
        return {
          groupKey,
          rows: orderedRows,
          first,
          primaryRow,
          symbol: getPositionUnderlying(first),
          description: primaryRow?.description || `${summarizeGroupedPositionTypes(orderedRows) || `${orderedRows.length} lines`}`,
          accountName: attributedAccountName,
          attributedAccountName,
          heldAccounts,
          totalMarketValue,
          totalCostBasis,
          totalGain: totalMarketValue - totalCostBasis,
          totalGainPct: totalCostBasis ? ((totalMarketValue - totalCostBasis) / totalCostBasis) * 100 : (first?.gainPct ?? null),
          qtyDisplay: primaryRow ? formatPositionQty(Number(primaryRow.qty) || 0) : '--',
          priceDisplay: primaryRow && Number.isFinite(Number(primaryRow.price)) ? `$${Number(primaryRow.price).toFixed(2)}` : '--',
          typeDisplay: summarizeGroupedPositionTypes(orderedRows) || (isOptionPosition(first) ? 'Option Strategy' : first?.assetType || 'Position'),
          sectorDisplay: groupSector || UNCLASSIFIED_SECTOR,
          overrideValue: orderedRows.map((row) => getPositionOverrideValue(row, sectorOverrides)).find((value) => value !== SECTOR_OVERRIDE_AUTO) || SECTOR_OVERRIDE_AUTO,
          attributionChanged: orderedRows.some((row) => getPositionDisplayAccount(row) !== getPositionHeldAccount(row)),
          expanded: Boolean(expandedPositionGroups[groupKey]),
        };
      })
      .sort((a, b) => Math.abs(b.totalMarketValue) - Math.abs(a.totalMarketValue));

    const displayRows = [];
    groups.forEach((group) => {
      const isGrouped = group.rows.length > 1;
      if (!isGrouped) {
        const row = group.rows[0];
        displayRows.push({
          kind: 'position',
          key: `${group.groupKey}-${row.symbol}-${row.qty}-${row.mktVal}-${row.costBasis}`,
          row,
          groupKey: group.groupKey,
          child: false,
        });
        return;
      }
      displayRows.push({
        kind: 'group',
        key: `group-${group.groupKey}`,
        ...group,
      });
      if (!group.expanded) return;
      group.rows.forEach((row, rowIndex) => {
        displayRows.push({
          kind: 'position',
          key: `${group.groupKey}-${row.symbol}-${row.qty}-${row.mktVal}-${row.costBasis}-${rowIndex}`,
          row,
          groupKey: group.groupKey,
          child: true,
        });
      });
    });
    return displayRows;
  }, [expandedPositionGroups, sectorOverrides, selectedAccount, selectedPositions]);

  useEffect(() => {
    setExpandedPositionGroups((prev) => {
      const valid = new Set(selectedPositions.map((position) => getPositionGroupKey(position, selectedAccount)));
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (valid.has(key)) next[key] = value;
      });
      return next;
    });
  }, [selectedAccount, selectedPositions]);

  const positionGroupCount = useMemo(
    () => positionsDisplay.filter((row) => row.kind === 'group' || !row.child).length,
    [positionsDisplay],
  );

  const updatePositionSectorOverride = useCallback((accountName, symbolInput, nextSector) => {
    const symbols = [...new Set((Array.isArray(symbolInput) ? symbolInput : [symbolInput]).filter(Boolean))];
    const keys = symbols.map((symbol) => getSectorOverrideKey(accountName, symbol));
    if (!keys.length) return;
    markSharedWorkspaceDirty('Sector overrides pending sync');
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
  }, [markSharedWorkspaceDirty]);

  const updatePositionAttributionOverride = useCallback((positionInput, nextAccount) => {
    const positions = Array.isArray(positionInput) ? positionInput : [positionInput];
    markSharedWorkspaceDirty('Desk attribution pending sync');
    const defaultEffectiveDate = nextAccount ? getSuggestedPositionTransferDate(positions) : '';
    setPositionAttributionOverrides((prev) => {
      const next = { ...prev };
      positions.forEach((position) => {
        const key = getPositionAttributionKey(position);
        const heldAccount = getPositionHeldAccount(position);
        if (!key || !heldAccount) return;
        if (!nextAccount || nextAccount === heldAccount) {
          if (key in next) delete next[key];
          return;
        }
        next[key] = nextAccount;
      });
      return next;
    });
    setPositionTransferEffectiveDates((prev) => {
      const next = { ...prev };
      positions.forEach((position) => {
        const key = getPositionAttributionKey(position);
        const heldAccount = getPositionHeldAccount(position);
        if (!key || !heldAccount) return;
        if (!nextAccount || nextAccount === heldAccount) {
          if (key in next) delete next[key];
          return;
        }
        if (!next[key] && defaultEffectiveDate) next[key] = defaultEffectiveDate;
      });
      return next;
    });
  }, [getSuggestedPositionTransferDate, markSharedWorkspaceDirty]);

  const updatePositionTransferEffectiveDate = useCallback((positionInput, nextDate) => {
    const positions = Array.isArray(positionInput) ? positionInput : [positionInput];
    const normalizedDate = normalizeDateInput(nextDate);
    markSharedWorkspaceDirty('Transfer effective date pending sync');
    setPositionTransferEffectiveDates((prev) => {
      const next = { ...prev };
      positions.forEach((position) => {
        const key = getPositionAttributionKey(position);
        if (!key) return;
        if (!normalizedDate) {
          if (key in next) delete next[key];
          return;
        }
        next[key] = normalizedDate;
      });
      return next;
    });
  }, [markSharedWorkspaceDirty]);

  const updateRealizedTradeAttributionOverride = useCallback((trade, nextAccount) => {
    const keys = getRealizedTradeOverrideKeys(trade);
    const heldAccount = normalizeAccountName(trade?.account);
    const inheritedAccount = getRealizedTradeInheritedAccount(trade, positionAttributionOverrides);
    if (!keys.length || !heldAccount) return;
    markSharedWorkspaceDirty('Closed-trade desk attribution pending sync');
    setRealizedTradeAttributionOverrides((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        if (key in next) delete next[key];
      });
      if (!nextAccount || nextAccount === REALIZED_ATTRIBUTION_FOLLOW_POSITION) {
        return next;
      }
      if (nextAccount === POSITION_ATTRIBUTION_HELD || nextAccount === heldAccount) {
        if (inheritedAccount && inheritedAccount !== heldAccount) {
          next[keys[0]] = heldAccount;
        }
        return next;
      }
      next[keys[0]] = nextAccount;
      return next;
    });
  }, [markSharedWorkspaceDirty, positionAttributionOverrides]);

  const updateRealizedTradeSectorOverride = useCallback((trade, nextSector) => {
    const keys = getRealizedTradeOverrideKeys(trade);
    if (!keys.length) return;
    markSharedWorkspaceDirty('Realized trade sector override pending sync');
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
  }, [markSharedWorkspaceDirty]);

  const setSectorAllocationBias = useCallback((sectorName, mode) => {
    if (!editableSectorScope) return;
    markSharedWorkspaceDirty('Sector targets pending sync');
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
  }, [editableSectorScope, markSharedWorkspaceDirty]);

  const nudgeSectorActiveWeight = useCallback((sectorName, delta) => {
    if (!editableSectorScope) return;
    markSharedWorkspaceDirty('Sector targets pending sync');
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
  }, [editableSectorScope, markSharedWorkspaceDirty]);

  const updateSectorBenchmarkWeight = useCallback((sectorName, nextWeight) => {
    if (!editableSectorScope) return;
    markSharedWorkspaceDirty('Sector targets pending sync');
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
  }, [editableSectorScope, markSharedWorkspaceDirty]);

  const updateSectorTargetWeight = useCallback((sectorName, nextWeight) => {
    if (!editableSectorScope) return;
    markSharedWorkspaceDirty('Sector targets pending sync');
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
  }, [editableSectorScope, markSharedWorkspaceDirty]);

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
    ? PALETTE.warning
    : /failed|unavailable|conflict/i.test(sharedSyncStatus)
      ? PALETTE.negative
      : /saving|loading|publishing|refreshing|clearing|pending|detected|merging/i.test(sharedSyncStatus)
        ? PALETTE.warning
        : PALETTE.positive;
  const sharedSyncValue = !sharedStateReady
    ? 'Booting'
    : /failed|unavailable|conflict/i.test(sharedSyncStatus)
      ? 'Error'
      : /saving|loading|publishing|refreshing|clearing|pending|detected|merging/i.test(sharedSyncStatus)
        ? 'Syncing'
        : 'Shared';
  const workspaceBadgeLabel = !sharedStateReady
    ? 'Workspace Booting'
    : sharedSyncValue === 'Error'
      ? 'Workspace Attention'
      : sharedSyncValue === 'Syncing'
        ? 'Workspace Syncing'
        : 'Workspace Live';
  const workspaceBadgeTone = !sharedStateReady
    ? PALETTE.warning
    : sharedSyncValue === 'Error'
      ? PALETTE.negative
      : sharedSyncValue === 'Syncing'
        ? PALETTE.warning
        : PALETTE.accentBright;
  const benchmarkFeedLabel = spxLoading ? 'Benchmarks Syncing' : spxData.length > 0 ? 'Benchmarks Live' : 'Benchmarks Pending';
  const terminalStatusTiles = [
    { label:'Scope', value: selectedAccount === 'ALL' ? 'All Accounts' : selectedAccount.split('...')[1] ? `Acct ${selectedAccount.split('...')[1]}` : selectedAccount, tone:PALETTE.info },
    { label:'Accounts', value: String(accountList.length), tone:PALETTE.accentBright },
    { label:'Positions', value: String(selectedPositions.length), tone:PALETTE.textStrong },
    { label:'Workspace', value: sharedSyncValue, tone: sharedSyncTone },
    { label:'Benchmarks', value: spxLoading ? 'Syncing' : spxData.length > 0 ? 'Live' : 'Offline', tone: spxLoading ? PALETTE.warning : spxData.length > 0 ? PALETTE.positive : PALETTE.negative },
    { label:'Realized Rows', value: String(selectedRealizedTrades.length), tone:PALETTE.accentMuted },
    { label:'Build', value: APP_BUILD_VERSION, tone:PALETTE.textMuted },
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
              <div style={{ ...S.statusPill, borderColor:hexToRgba(workspaceBadgeTone, 0.34), color:workspaceBadgeTone }}>{workspaceBadgeLabel}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', justifyContent:'flex-end' }}>
              <div style={{ ...S.statusPill, color:PALETTE.textMuted }}>{new Date().toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'})}</div>
              <div style={{ ...S.statusPill, borderColor:PALETTE.border, color:PALETTE.textMuted }}>Build {APP_BUILD_VERSION}</div>
              <div style={{ ...S.statusPill, borderColor:PALETTE.border, color:PALETTE.info }}>{selectedAccountLabel}</div>
              <div style={{ ...S.statusPill, borderColor:hexToRgba(spxData.length > 0 ? PALETTE.positive : PALETTE.warning, 0.28), color: spxData.length > 0 ? PALETTE.positive : PALETTE.warning }}>{benchmarkFeedLabel}</div>
              <div style={{ ...S.statusPill, borderColor:PALETTE.border, color: totalPortfolioValue > 0 ? PALETTE.textStrong : PALETTE.textDim, minWidth:'148px', textAlign:'right' }}>{fmt$(totalPortfolioValue)}</div>
            </div>
          </div>
          <div style={S.marketRibbon}>
            {deskClocks.map((clock) => (
              <div key={clock.label} style={S.marketTile}>
                <div style={{ color:PALETTE.textDim, fontSize:'9px', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'4px', fontFamily:"'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif" }}>{clock.label}</div>
                <div style={{ color:PALETTE.textStrong, fontSize:'18px', fontWeight:700, letterSpacing:'0.8px', fontFamily:"'IBM Plex Mono', monospace" }}>{formatDeskTime(clock.zone)}</div>
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
                  borderColor: selectedAccount===acc ? PALETTE.borderStrong : PALETTE.border,
                  color: selectedAccount===acc ? PALETTE.accentBright : PALETTE.textMuted,
                }}>
                {acc === 'ALL' ? 'ALL' : acc.split('...')[1] ? `...${acc.split('...')[1]}` : acc}
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <div style={{ ...S.statusPill, color:PALETTE.textMuted }}>Chart TF {timeframe}</div>
              <div style={{ ...S.statusPill, color:PALETTE.textMuted }}>{selectedPositions.length} Live Positions</div>
              <div style={{ ...S.statusPill, color: spxData.length > 0 ? PALETTE.positive : PALETTE.warning }}>{benchmarkFeedLabel}</div>
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
                { label:'Total Return', val: fmtPct(allTimeStats.total), sub: 'Since Inception', color: allTimeStats.total >= 0 ? PALETTE.positive : PALETTE.negative },
                { label:'YTD Return', val: fmtPct(allTimeStats.ytd), sub: '2026', color: allTimeStats.ytd >= 0 ? PALETTE.positive : PALETTE.negative },
                { label:'Max Drawdown', val: fmtPct(-allTimeStats.maxDrawdown), sub: 'Peak to Trough', color:PALETTE.warning },
                { label:'Volatility', val: `${fmtNum(allTimeStats.volatility)}%`, sub: 'Annualized' },
                { label:'Sharpe Ratio', val: fmtNum(allTimeStats.sharpe), sub: 'Risk-Adjusted', color: allTimeStats.sharpe >= 1 ? PALETTE.positive : allTimeStats.sharpe >= 0 ? PALETTE.warning : PALETTE.negative },
              ].map(({ label, val, sub, color }) => (
                <div key={label} style={signalPanelStyle(color || '#8f99a3')}>
                  <div style={S.cardTitle}>{label}</div>
                  <div style={{ fontSize:'20px', fontWeight:700, color: color || PALETTE.textStrong, letterSpacing:'-0.5px' }}>{val}</div>
                  <div style={{ fontSize:'10px', color:PALETTE.textDim, marginTop:'2px' }}>{sub}</div>
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
                    <ReferenceLine y={0} stroke={PALETTE.lineGrid} strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="portPct" stroke={PALETTE.portfolio} dot={false} strokeWidth={2} name="Portfolio" />
                    {showBenchmark && <Line type="monotone" dataKey="spxPct" stroke={PALETTE.benchmark} dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="SPX" />}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:PALETTE.textDim }}>
                  Upload balance history to view performance chart
                </div>
              )}
              <div style={{ display:'flex', gap:'16px', marginTop:'8px' }}>
                <label style={{ color:PALETTE.textDim, fontSize:'10px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
                  <input type="checkbox" checked={showBenchmark} onChange={e => setShowBenchmark(e.target.checked)} style={{ accentColor:PALETTE.accent }} />
                  Show SPX Benchmark
                </label>
              </div>
            </div>

            <div style={{ ...S.col, gap:'8px' }}>
              <div style={S.card}>
                <div style={S.cardTitle}>TOTAL PORTFOLIO</div>
                <div style={{ fontSize:'22px', fontWeight:700, color:PALETTE.textStrong }}>{fmt$(totalPortfolioValue)}</div>
                <div style={{ fontSize:'10px', color:PALETTE.textDim, marginTop:'4px' }}>{accountSummary.length} accounts</div>
              </div>
              {accountSummary.slice(0,4).map(acc => (
                <div key={acc.name} style={{ ...S.card, cursor:'pointer', borderColor: selectedAccount===acc.name ? PALETTE.borderStrong : PALETTE.borderSubtle }}
                  onClick={() => setSelectedAccount(acc.name)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ color: acc.color, fontSize:'11px', fontWeight:700 }}>...{acc.name.split('...')[1]}</div>
                    <div style={{ color: acc.today >= 0 ? PALETTE.positive : PALETTE.negative, fontSize:'11px' }}>{fmtPct(acc.today)}</div>
                  </div>
                  <div style={{ fontSize:'14px', fontWeight:700, color:PALETTE.textStrong, marginTop:'2px' }}>{fmt$(acc.total)}</div>
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
                        <td style={{ ...S.td, color: acc.today >= 0 ? PALETTE.positive : PALETTE.negative }}>{fmtPct(acc.today)}</td>
                        <td style={{ ...S.td, color: acc.totalReturn >= 0 ? PALETTE.positive : PALETTE.negative }}>{fmtPct(acc.totalReturn)}</td>
                        <td style={S.td}>{acc.posCount}</td>
                        <td style={S.td}>{fmt$(acc.cost)}</td>
                        <td style={{ ...S.td, color: unrealized >= 0 ? PALETTE.positive : PALETTE.negative }}>{fmt$(unrealized)} {acc.cost > 0 ? `(${fmtPct((unrealized/acc.cost)*100)})` : ''}</td>
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
                <div style={{ color:PALETTE.textDim, fontSize:'11px' }}>
                  Toggle between legal broker NAV and desk-attributed NAV, then add or remove account lines independently from the dashboard account filter.
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPerformanceChartMode('line')}
                  style={{ ...S.btn, ...(performanceChartMode === 'line' ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px' }}
                >
                  Line View
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceChartMode('bar')}
                  style={{ ...S.btn, ...(performanceChartMode === 'bar' ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px' }}
                >
                  Bar View
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceAccountingMode('desk')}
                  style={{ ...S.btn, ...(performanceAccountingMode === 'desk' ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px', borderColor:PALETTE.accentBright, color:PALETTE.accentBright }}
                >
                  Desk NAV
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceAccountingMode('legal')}
                  style={{ ...S.btn, ...(performanceAccountingMode === 'legal' ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px' }}
                >
                  Legal NAV
                </button>
                <button type="button" onClick={() => setAllPerformanceAccounts(true)} style={{ ...S.btn, padding:'4px 10px', fontSize:'10px' }}>All Accounts</button>
                <button type="button" onClick={() => setAllPerformanceAccounts(false)} style={{ ...S.btn, padding:'4px 10px', fontSize:'10px' }}>Clear Accounts</button>
              </div>
            </div>
            {performanceAccountingMode === 'desk' && deskPerformanceModel.transferCount > 0 && (
              <div style={{ color:PALETTE.textDim, fontSize:'10px', marginBottom:'10px' }}>
                Desk NAV reallocates routed P/L from {deskPerformanceModel.transferCount} routed holdings
                {' '}({deskPerformanceModel.openTransferCount || 0} open · {deskPerformanceModel.closedTransferCount || 0} closed).
                {' '}Futures snapshot carry: {deskPerformanceModel.snapshotBackedCount || 0} · direct price history: {deskPerformanceModel.priceBackedCount} · account-return fallback: {deskPerformanceModel.accountBackedCount} · linear carry fallback: {deskPerformanceModel.linearCount || 0} · flat fallback: {deskPerformanceModel.flatCount}
              </div>
            )}
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <button
                type="button"
                onClick={togglePerformanceAggregate}
                style={{ ...S.btn, ...(performanceChartSelection.aggregate ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px', borderColor:PALETTE.portfolio, color:PALETTE.portfolio }}
              >
                Aggregate
              </button>
              <button
                type="button"
                onClick={togglePerformanceSPX}
                style={{ ...S.btn, ...(performanceChartSelection.spx ? S.btnActive : {}), padding:'4px 10px', fontSize:'10px', borderColor:PALETTE.benchmark, color:PALETTE.accentBright }}
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
                    borderColor: accountColorMap[accountName] || PALETTE.borderSubtle,
                    color: performanceChartSelection.accounts?.[accountName] ? accountColorMap[accountName] || PALETTE.textStrong : PALETTE.textDim,
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
              <div style={S.cardTitle}>
                {performanceChartMode === 'bar' ? 'PERIOD RETURN SNAPSHOT' : 'NORMALIZED PERFORMANCE COMPARISON'}
                {' '}· {timeframe} · {performanceAccountingMode === 'desk' ? 'Desk NAV' : 'Legal NAV'}
              </div>
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
            {performanceChartMode === 'bar' && performanceBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={372}>
                <BarChart data={performanceBarData} margin={{ top:10, right:22, bottom:8, left:10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.lineGrid} />
                  <XAxis dataKey="label" tick={CHART_TICK_STYLE} interval={0} minTickGap={24} tickMargin={8} />
                  <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="pct" />} />
                  <ReferenceLine y={0} stroke={PALETTE.lineGrid} />
                  <Bar dataKey="value" name="Return" radius={[2, 2, 0, 0]}>
                    {performanceBarData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : performanceComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height={372}>
                <LineChart data={performanceComparisonData} margin={{ top:10, right:22, bottom:8, left:10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.lineGrid} />
                  <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(performanceComparisonData.length)} minTickGap={24} tickMargin={8} />
                  <YAxis width={62} tick={CHART_TICK_STYLE} tickFormatter={v => `${v>=0?'+':''}${v.toFixed(1)}%`} tickMargin={8} />
                  <Tooltip content={<CustomTooltip mode="pct" />} />
                  <Legend wrapperStyle={{ fontSize:'11px', color:PALETTE.textMuted, paddingTop:'6px' }} />
                  <ReferenceLine y={0} stroke={PALETTE.lineGrid} />
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
              <div style={{ height:360, display:'flex', alignItems:'center', justifyContent:'center', color:PALETTE.textDim }}>
                Select at least one account, aggregate portfolio, or SPX to chart performance.
              </div>
            )}
          </div>

          {/* Stats grid */}
          {performanceStats && (
            <div style={{ ...S.grid(4), marginBottom:'16px' }}>
              {[
                ['Period Return', fmtPct(performanceStats.total), performanceStats.total >= 0 ? PALETTE.positive : PALETTE.negative],
                ['YTD Return', fmtPct(performanceStats.ytd), performanceStats.ytd >= 0 ? PALETTE.positive : PALETTE.negative],
                ['Max Drawdown', fmtPct(-performanceStats.maxDrawdown), PALETTE.warning],
                ['Annualized Vol', `${fmtNum(performanceStats.volatility)}%`, PALETTE.textStrong],
                ['Sharpe Ratio', fmtNum(performanceStats.sharpe), performanceStats.sharpe >= 1 ? PALETTE.positive : PALETTE.warning],
                ['Calmar Ratio', fmtNum(performanceStats.calmar), performanceStats.calmar >= 1 ? PALETTE.positive : PALETTE.warning],
                ['Current NAV', fmt$(performanceStats.currentNav), PALETTE.textStrong],
                ['Data Points', performanceFilteredHistory.length.toString(), PALETTE.textDim],
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
            <div style={S.cardTitle}>ABSOLUTE NAV — {selectedAccount === 'ALL' ? 'Aggregate Portfolio' : selectedAccount} · {performanceAccountingMode === 'desk' ? 'Desk NAV' : 'Legal NAV'}</div>
            <ResponsiveContainer width="100%" height={214}>
              <AreaChart data={performanceFilteredHistory.map(([d,v]) => ({ date:d, nav:v }))} margin={{ top:10, right:18, bottom:8, left:12 }}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.accentBright} stopOpacity={0.12}/>
                    <stop offset="95%" stopColor={PALETTE.accentBright} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.lineGrid} />
                <XAxis dataKey="date" tick={CHART_TICK_STYLE} tickFormatter={d => d.slice(0,7)} interval={getTickInterval(performanceFilteredHistory.length)} minTickGap={24} tickMargin={8} />
                <YAxis width={76} tick={CHART_TICK_STYLE} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tickMargin={8} />
                <Tooltip content={<CustomTooltip mode="$" />} />
                <Area type="monotone" dataKey="nav" stroke={PALETTE.portfolio} fill="url(#navGrad)" strokeWidth={2} dot={false} name="NAV" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════ POSITIONS TAB ══════ */}
      {tab === 'positions' && (
        <div style={S.section}>
          <div style={{ marginBottom:'12px', color:PALETTE.textDim, fontSize:'11px' }}>
            {positionGroupCount} grouped lines · {selectedPositions.length} total positions · {selectedAccount === 'ALL' ? 'All Accounts' : selectedAccount}
          </div>
          <div style={{ ...S.card, marginBottom:'12px', background:'linear-gradient(180deg, rgba(23,26,30,0.98), rgba(11,13,16,0.98))' }}>
            <div style={{ ...S.cardTitle, color:PALETTE.accentBright, marginBottom:'6px' }}>DESK ATTRIBUTION</div>
            <div style={{ color:PALETTE.textMuted, fontSize:'11px', lineHeight:'1.6' }}>
              Reassign holdings to the desk account that should own them economically. Legal balances stay untouched; desk-attributed NAV is rebuilt separately in the Performance tab.
            </div>
          </div>
          <div style={S.card}>
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>{['Symbol','Description','Account Routing','Type','Sector Assignment','Qty','Price','Market Value','Cost Basis','Gain $','Gain %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {positionsDisplay.map((entry, i) => {
                    const isGroup = entry.kind === 'group';
                    const row = isGroup ? null : entry.row;
                    const sectorValue = isGroup ? entry.sectorDisplay : (row?.sector || UNCLASSIFIED_SECTOR);
                    const gainValue = isGroup ? entry.totalGain : ((row?.mktVal || 0) - (row?.costBasis || 0));
                    const gainPct = isGroup ? entry.totalGainPct : row?.gainPct;
                    const attributedAccountName = isGroup ? entry.attributedAccountName : getPositionDisplayAccount(row);
                    const heldAccounts = isGroup ? entry.heldAccounts : [getPositionHeldAccount(row)];
                    const heldAccountLabel = summarizeAccountNames(heldAccounts);
                    const attributionChanged = isGroup
                      ? entry.attributionChanged
                      : getPositionDisplayAccount(row) !== getPositionHeldAccount(row);
                    const transferReferencePosition = isGroup ? entry.rows?.[0] : row;
                    const transferEffectiveDate = attributionChanged
                      ? getPositionTransferEffectiveDate(transferReferencePosition, positionTransferEffectiveDates, futuresPnlSnapshots)
                      : '';
                    const attributionValue = attributionChanged ? attributedAccountName : POSITION_ATTRIBUTION_HELD;
                    const badgeColor = isGroup
                      ? PALETTE.accentMuted
                      : isOptionPosition(row)
                        ? PALETTE.warning
                        : isFuturePosition(row)
                          ? PALETTE.brass
                        : isEtfPosition(row)
                          ? PALETTE.steel
                          : PALETTE.info;
                    const badgeLabel = isGroup
                      ? 'GROUP'
                      : isOptionPosition(row)
                        ? 'OPT'
                        : isFuturePosition(row)
                          ? 'FUT'
                        : isEtfPosition(row)
                          ? 'ETF'
                          : 'EQ';

                    return (
                      <tr
                        key={entry.key}
                        style={{
                          background: isGroup
                            ? 'linear-gradient(90deg, rgba(216,139,47,0.14) 0%, rgba(18,21,25,0.98) 22%, rgba(18,21,25,0.98) 100%)'
                            : entry.child
                              ? 'rgba(11,13,16,0.95)'
                              : i % 2
                                ? 'rgba(17,19,22,0.98)'
                                : 'rgba(13,15,18,0.98)',
                        }}
                      >
                        <td style={{ ...S.td, fontWeight:700, color: isGroup ? PALETTE.textStrong : (isOptionPosition(row) ? PALETTE.warning : isFuturePosition(row) ? PALETTE.brass : PALETTE.portfolio) }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', paddingLeft: entry.child ? '20px' : 0 }}>
                            {isGroup && (
                              <button
                                type="button"
                                onClick={() => setExpandedPositionGroups((prev) => ({ ...prev, [entry.groupKey]: !prev[entry.groupKey] }))}
                                style={{
                                  width:'18px',
                                  height:'18px',
                                  border:`1px solid ${PALETTE.borderStrong}`,
                                  background:'linear-gradient(180deg, rgba(53,40,21,0.96), rgba(16,14,12,0.98))',
                                  color:PALETTE.accentBright,
                                  cursor:'pointer',
                                  borderRadius:'2px',
                                  fontSize:'10px',
                                  lineHeight:'16px',
                                  padding:0,
                                }}
                              >
                                {entry.expanded ? '−' : '+'}
                              </button>
                            )}
                            <span>{isGroup ? entry.symbol : row.symbol}</span>
                          </div>
                        </td>
                        <td style={{ ...S.td, maxWidth:'300px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: entry.child ? PALETTE.textMuted : PALETTE.text }}>
                          {isGroup
                            ? entry.description
                            : (row.description || (isOptionPosition(row) ? row.symbol : '--'))}
                        </td>
                        <td style={{ ...S.td, minWidth:'210px' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                              <span style={{ color: attributionChanged ? PALETTE.accentBright : PALETTE.textStrong, fontSize:'11px', fontWeight:600 }}>
                                Desk {formatShortAccountName(attributedAccountName)}
                              </span>
                              <span style={{ color:PALETTE.textDim, fontSize:'10px' }}>
                                Held {heldAccountLabel}
                              </span>
                            </div>
                            {!entry.child ? (
                              <>
                                <select
                                  value={attributionValue || POSITION_ATTRIBUTION_HELD}
                                  onChange={(e) => updatePositionAttributionOverride(
                                    isGroup ? entry.rows : row,
                                    e.target.value === POSITION_ATTRIBUTION_HELD ? '' : e.target.value,
                                  )}
                                  style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'176px' }}
                                >
                                  <option value={POSITION_ATTRIBUTION_HELD}>
                                    {isGroup ? 'Held Accounts (reset each line)' : `Held Account (${heldAccountLabel})`}
                                  </option>
                                  {accountList.map((accountName) => (
                                    <option key={accountName} value={accountName}>
                                      {formatShortAccountName(accountName)}
                                    </option>
                                  ))}
                                </select>
                                {attributionChanged && (
                                  <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                                    <span style={{ color:PALETTE.textDim, fontSize:'10px' }}>Transfer effective</span>
                                    <input
                                      type="date"
                                      value={transferEffectiveDate || ''}
                                      onChange={(e) => updatePositionTransferEffectiveDate(isGroup ? entry.rows : row, e.target.value)}
                                      style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'176px' }}
                                    />
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: attributionChanged ? PALETTE.accentBright : PALETTE.textDim, fontSize:'10px' }}>
                                {attributionChanged ? 'Attributed away from held account' : 'Held in legal account'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={S.td}>
                          {isGroup ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                              <span style={S.badge(badgeColor)}>GROUP</span>
                              <span style={{ color:PALETTE.textMuted, fontSize:'10px' }}>{entry.typeDisplay}</span>
                            </div>
                          ) : (
                            <span style={S.badge(badgeColor)}>{badgeLabel}</span>
                          )}
                        </td>
                        <td style={S.td}>
                          {isGroup ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'6px', minWidth:'180px' }}>
                              <div><span style={{ color: SECTOR_COLORS[sectorValue] || PALETTE.textDim }}>●</span> {sectorValue}</div>
                              <select
                                value={entry.overrideValue || SECTOR_OVERRIDE_AUTO}
                                onChange={(e) => updatePositionSectorOverride(
                                  entry.accountName,
                                  entry.rows.flatMap((position) => getPositionOverrideCandidates(position)),
                                  e.target.value,
                                )}
                                style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'160px' }}
                              >
                                <option value={SECTOR_OVERRIDE_AUTO}>Auto ({entry.first?.mainSector || UNCLASSIFIED_SECTOR})</option>
                                {ALL_SECTORS.map((sector) => (
                                  <option key={sector.name} value={sector.name}>{sector.name}</option>
                                ))}
                                <option value={UNCLASSIFIED_SECTOR}>{UNCLASSIFIED_SECTOR}</option>
                              </select>
                            </div>
                          ) : !entry.child ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'6px', minWidth:'180px' }}>
                              <div><span style={{ color: SECTOR_COLORS[sectorValue] || PALETTE.textDim }}>●</span> {sectorValue}</div>
                              <select
                                value={getPositionOverrideValue(row, sectorOverrides)}
                                onChange={(e) => updatePositionSectorOverride(
                                  row.attributedAccount || getPositionHeldAccount(row),
                                  getPositionOverrideCandidates(row),
                                  e.target.value,
                                )}
                                style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'160px' }}
                              >
                                <option value={SECTOR_OVERRIDE_AUTO}>Auto ({row.mainSector || UNCLASSIFIED_SECTOR})</option>
                                {ALL_SECTORS.map((sector) => (
                                  <option key={sector.name} value={sector.name}>{sector.name}</option>
                                ))}
                                <option value={UNCLASSIFIED_SECTOR}>{UNCLASSIFIED_SECTOR}</option>
                              </select>
                            </div>
                          ) : (
                            <div style={{ color: entry.child ? PALETTE.textDim : PALETTE.textMuted }}>
                              <span style={{ color: SECTOR_COLORS[sectorValue] || PALETTE.textDim }}>●</span> {sectorValue}
                            </div>
                          )}
                        </td>
                        <td style={{ ...S.td, color: Number(isGroup ? entry.primaryRow?.qty : row?.qty) < 0 ? PALETTE.negative : PALETTE.textStrong }}>
                          {isGroup ? entry.qtyDisplay : formatPositionQty(Number(row?.qty) || 0)}
                        </td>
                        <td style={S.td}>{isGroup ? entry.priceDisplay : (row?.price ? `$${row.price.toFixed(2)}` : '--')}</td>
                        <td style={{ ...S.td, fontWeight:600 }}>{fmt$(isGroup ? entry.totalMarketValue : row?.mktVal)}</td>
                        <td style={S.td}>{fmt$(isGroup ? entry.totalCostBasis : row?.costBasis)}</td>
                        <td style={{ ...S.td, color: gainValue >= 0 ? PALETTE.positive : PALETTE.negative }}>{fmt$(gainValue)}</td>
                        <td style={{ ...S.td, color: gainPct >= 0 ? PALETTE.positive : PALETTE.negative, fontWeight:600 }}>{fmtPct(gainPct)}</td>
                      </tr>
                    );
                  })}
                  {positionsDisplay.length === 0 && (
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
                  <tr>{['Symbol','Account Routing','Type','Sector Assignment','Closed Date','Qty','Proceeds','Cost','Gain $','Gain %','Term'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredRealizedTrades.slice(0, 100).map((t, i) => {
                    const badge = getRealizedTradeBadge(t);
                    return (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight:700, color: badge.color }}>{t.symbol.length > 30 ? t.symbol.slice(0,28)+'…' : t.symbol}</td>
                      <td style={{ ...S.td, minWidth:'210px' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                            <span style={{ color: t.attributedAccount !== t.custodyAccount ? PALETTE.accentBright : PALETTE.textStrong, fontSize:'11px', fontWeight:600 }}>
                              Desk {formatShortAccountName(t.attributedAccount)}
                            </span>
                            <span style={{ color:PALETTE.textDim, fontSize:'10px' }}>
                              Held {formatShortAccountName(t.custodyAccount)}
                            </span>
                          </div>
                          <select
                            value={getRealizedTradeAttributionSelectionValue(
                              t,
                              realizedTradeAttributionOverrides,
                              positionAttributionOverrides,
                            )}
                            onChange={(e) => updateRealizedTradeAttributionOverride(
                              t,
                              e.target.value,
                            )}
                            style={{ ...S.input, padding:'4px 6px', fontSize:'10px', minWidth:'176px' }}
                          >
                            <option value={POSITION_ATTRIBUTION_HELD}>
                              Held Account ({formatShortAccountName(t.custodyAccount)})
                            </option>
                            {t.inheritedAccount && t.inheritedAccount !== t.custodyAccount && (
                              <option value={REALIZED_ATTRIBUTION_FOLLOW_POSITION}>
                                Follow Position Transfer ({formatShortAccountName(t.inheritedAccount)})
                              </option>
                            )}
                            {accountList.map((accountName) => (
                              <option key={accountName} value={accountName}>
                                {formatShortAccountName(accountName)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={S.td}><span style={S.badge(badge.color)}>{badge.label}</span></td>
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
                      <td style={S.td}>{Number.isFinite(Number(t.qty)) && Number(t.qty) !== 0 ? t.qty : '--'}</td>
                      <td style={S.td}>{fmt$(t.proceeds)}</td>
                      <td style={S.td}>{fmt$(t.cost)}</td>
                      <td style={{ ...S.td, color: t.gain >= 0 ? '#00e676' : '#ff4444', fontWeight:600 }}>{fmt$(t.gain)}</td>
                      <td style={{ ...S.td, color: t.gain >= 0 ? '#00e676' : '#ff4444' }}>{fmtPct(t.gainPct)}</td>
                      <td style={S.td}><span style={S.badge(t.term === 'Long Term' ? '#00e676' : '#ffd600')}>{t.term === 'Long Term' ? 'LT' : 'ST'}</span></td>
                    </tr>
                  );})}
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

          <div style={{ ...S.card, marginBottom:'16px', display:'flex', justifyContent:'space-between', gap:'16px', alignItems:'flex-start', flexWrap:'wrap' }}>
            <div style={{ maxWidth:'760px' }}>
              <div style={{ ...S.cardTitle, color:PALETTE.accentBright, marginBottom:'6px' }}>FUTURES STATEMENT ROUTING</div>
              <div style={{ color:PALETTE.textMuted, fontSize:'11px', lineHeight:'1.6' }}>
                Schwab account statements do not always identify a masked account suffix when they include futures. Choose the legal held account for the futures statement here.
                If the statement is ambiguous, you can leave it on auto-detect or route it to the clearing bucket, then reassign the desk owner in the Positions tab without rewriting custody.
              </div>
            </div>
            <div style={{ minWidth:'260px' }}>
              <div style={{ color:PALETTE.textDim, fontSize:'10px', textTransform:'uppercase', letterSpacing:'1.2px', marginBottom:'6px' }}>Statement Held Account</div>
              <select
                value={futuresStatementImportAccount}
                onChange={(e) => setFuturesStatementImportAccount(e.target.value)}
                style={{ ...S.input, width:'100%', minWidth:'240px' }}
              >
                <option value={FUTURES_STATEMENT_ACCOUNT_AUTO}>
                  Auto-detect (defaults to ...145 when available)
                </option>
                <option value={FUTURES_CLEARING_ACCOUNT}>Futures Clearing Bucket</option>
                {accountList.map((accountName) => (
                  <option key={accountName} value={accountName}>
                    {formatShortAccountName(accountName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={S.grid(4)}>
            {[
              {
                key: 'positions', label: 'POSITIONS FILE', hint: 'All-Accounts-Positions-*.csv',
                desc: 'Export from Schwab: Accounts → All Accounts → Positions → Export. Contains current holdings, prices, and market values for all accounts.',
                handler: handlePositionsUpload, accept: '.csv,.CSV',
                fields: ['Symbol', 'Description', 'Qty', 'Price', 'Market Value', 'Cost Basis', 'Asset Type'],
              },
              {
                key: 'futures', label: 'FUTURES STATEMENT FILE', hint: 'AccountStatement_*.csv',
                desc: 'Export from Schwab account statement CSV. Imports the Futures and Futures Options sections as supplemental live positions so they persist alongside the normal positions file.',
                handler: handleFuturesStatementUpload, accept: '.csv,.CSV',
                fields: ['Futures: Symbol', 'SPC', 'Qty', 'Trade Price', 'Mark', 'P/L Day'],
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
