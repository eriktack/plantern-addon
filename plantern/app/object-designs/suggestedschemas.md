# Object library: the schemas (corrected)

The schemas of the library items, one generator per queue row (`object-designs/LIBRARY.md`). This is the base that `object-designs/tools/make-briefs.js` reads. It was the original suggestion, converted and corrected in one place (decision 231). Values are in **millimetres**; keys are camelCase.

Per generator:
- `parameters`: the table rows, in order. Includes `variant` (an enum of the variants) and `material` (the default material, `type: "material"`). `unit` is `mm` for numbers.
- `variant_defaults`: the values each variant starts from, in mm.
- `parts`: the part keys and labels, as `[key, label]`.
- `placement`: where a new object starts in a house (decision 230). A hint, not a parameter.
- `notes`: plain facts the agent needs for this item.

```json
{
  "category": "seating",
  "generators": [
    {
      "id": "chair",
      "parameters": [
        {
          "key": "variant",
          "labels": { "dining": "Dining chair", "armchair": "Armchair", "office": "Office chair", "lounge": "Lounge chair" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "dining",
            "armchair",
            "office",
            "lounge"
          ],
          "default": "dining"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 400,
          "max": 1000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 500,
          "min": 450,
          "max": 900,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 850,
          "min": 750,
          "max": 1050,
          "step": 10
        },
        {
          "key": "seatHeight",
          "label": "Seat height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 400,
          "max": 550,
          "step": 10
        },
        {
          "key": "arms",
          "label": "Arms",
          "type": "boolean",
          "default": false
        },
        {
          "key": "upholstered",
          "label": "Upholstered",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "frame",
          "Frame"
        ],
        [
          "seat",
          "Seat and back"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "dining": {
          "arms": false,
          "upholstered": false
        },
        "armchair": {
          "width": 800,
          "depth": 850,
          "height": 900,
          "arms": true,
          "upholstered": true
        },
        "office": {
          "width": 650,
          "depth": 650,
          "height": 1050,
          "seatHeight": 480,
          "arms": true,
          "upholstered": true
        },
        "lounge": {
          "width": 750,
          "depth": 800,
          "height": 850,
          "seatHeight": 420,
          "arms": true,
          "upholstered": true
        }
      }
    },
    {
      "id": "sofa",
      "parameters": [
        {
          "key": "variant",
          "labels": { "two_seat": "Two-seat", "three_seat": "Three-seat", "corner_l": "L-shaped corner", "corner_u": "U-shaped corner", "sofa_bed": "Sofa bed" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "two_seat",
            "three_seat",
            "corner_l",
            "corner_u",
            "sofa_bed"
          ],
          "default": "two_seat"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 2100,
          "min": 1000,
          "max": 3200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 950,
          "min": 850,
          "max": 1050,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 850,
          "min": 750,
          "max": 950,
          "step": 10
        },
        {
          "key": "seatHeight",
          "label": "Seat height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 400,
          "max": 500,
          "step": 10
        },
        {
          "key": "armStyle",
          "label": "Arm style",
          "type": "enum",
          "options": [
            "track",
            "rolled",
            "square",
            "none"
          ],
          "default": "track"
        },
        {
          "key": "chaiseSide",
          "appliesTo": ["two_seat", "three_seat", "sofa_bed", "corner_l"],
          "label": "Chaise side",
          "type": "enum",
          "options": [
            "none",
            "left",
            "right"
          ],
          "default": "none"
        },
        {
          "key": "chaiseLength",
          "appliesTo": ["two_seat", "three_seat", "sofa_bed"],
          "label": "Chaise length",
          "type": "number",
          "unit": "mm",
          "default": 1700,
          "min": 1000,
          "max": 2000,
          "step": 10
        },
        {
          "key": "cornerChaiseLength",
          "appliesTo": ["corner_l"],
          "label": "Chaise length (L)",
          "type": "number",
          "unit": "mm",
          "default": 2400,
          "min": 1000,
          "max": 3200,
          "step": 10
        },
        {
          "key": "cornerLegLength",
          "appliesTo": ["corner_l", "corner_u"],
          "label": "Corner leg length",
          "type": "number",
          "unit": "mm",
          "default": 2400,
          "min": 1600,
          "max": 3200,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "fabric"
        }
      ],
      "parts": [
        [
          "frame",
          "Frame and arms"
        ],
        [
          "cushions",
          "Cushions"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "two_seat": {
          "width": 1600,
          "depth": 900,
          "height": 800
        },
        "three_seat": {
          "width": 2100,
          "depth": 950,
          "height": 850
        },
        "corner_l": {
          "width": 2800,
          "depth": 950,
          "height": 850,
          "cornerLegLength": 2400
        },
        "corner_u": {
          "width": 3000,
          "depth": 950,
          "height": 850,
          "cornerLegLength": 2000
        },
        "sofa_bed": {
          "width": 2000,
          "depth": 950,
          "height": 850,
          "armStyle": "square"
        }
      },
      "notes": [
        "`width` is the length of the back and `depth` the depth of the seat. For `corner_l`, a second seat runs forward from one end of the back to `cornerLegLength` from the back; for `corner_u`, from both ends. `chaiseSide` adds a chaise to a straight sofa on either side; for `corner_l` only on the right, the side opposite its return on the left (decision 235); `corner_u` takes none.",
        "`sofa_bed` (Swedish bäddsoffa) looks like a sofa: model it closed."
      ]
    },
    {
      "id": "stool",
      "parameters": [
        {
          "key": "variant",
          "labels": { "bar": "Bar stool", "counter": "Counter stool", "step": "Step stool" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "bar",
            "counter",
            "step"
          ],
          "default": "bar"
        },
        {
          "key": "diameter",
          "label": "Diameter",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 350,
          "max": 550,
          "step": 10
        },
        {
          "key": "seatHeight",
          "label": "Seat height",
          "type": "number",
          "unit": "mm",
          "default": 750,
          "min": 250,
          "max": 800,
          "step": 10
        },
        {
          "key": "backrest",
          "label": "Backrest",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "seat",
          "Seat"
        ],
        [
          "legs",
          "Legs"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "bar": {
          "seatHeight": 750
        },
        "counter": {
          "seatHeight": 650
        },
        "step": {
          "seatHeight": 350,
          "diameter": 350
        }
      }
    },
    {
      "id": "bench",
      "parameters": [
        {
          "key": "variant",
          "labels": { "dining": "Dining bench", "entry": "Entry bench", "upholstered": "Upholstered bench", "kitchen_sofa": "Kitchen settee", "sauna_lave": "Sauna bench (lave)" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "dining",
            "entry",
            "upholstered",
            "kitchen_sofa",
            "sauna_lave"
          ],
          "default": "dining"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1200,
          "min": 600,
          "max": 2000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 350,
          "min": 300,
          "max": 650,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 400,
          "max": 500,
          "step": 10
        },
        {
          "key": "backrest",
          "label": "Backrest",
          "type": "boolean",
          "default": false
        },
        {
          "key": "arms",
          "label": "Armrests",
          "type": "boolean",
          "default": false
        },
        {
          "key": "backrestHeight",
          "label": "Backrest height",
          "type": "number",
          "unit": "mm",
          "default": 950,
          "min": 600,
          "max": 1200,
          "step": 10
        },
        {
          "key": "storageLid",
          "label": "Storage lid",
          "type": "boolean",
          "default": false
        },
        {
          "key": "tiers",
          "label": "Tiers",
          "type": "integer",
          "default": 1,
          "min": 1,
          "max": 3
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "seat",
          "Seat"
        ],
        [
          "frame",
          "Frame and back"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "entry": {
          "storageLid": true,
          "width": 1000
        },
        "upholstered": {
          "backrest": true,
          "width": 1400,
          "backrestHeight": 800
        },
        "kitchen_sofa": {
          "width": 1800,
          "depth": 550,
          "height": 450,
          "backrest": true,
          "arms": true,
          "storageLid": true
        },
        "sauna_lave": {
          "width": 1800,
          "depth": 600,
          "height": 450,
          "tiers": 2,
          "material": "pine"
        }
      },
      "notes": [
        "`height` is the seat height. A backrest reaches about 950 mm from the floor.",
        "`kitchen_sofa` is the Swedish kökssoffa: a wooden settee with a tall back and a lid over storage in the seat.",
        "`tiers` above 1 (sauna benches, Swedish lave): each further tier stands `depth` further back and 400 mm higher, so the whole bench is `tiers` × `depth` deep."
      ]
    }
  ]
}
```

```json
{
  "category": "tables",
  "generators": [
    {
      "id": "coffee_table",
      "parameters": [
        {
          "key": "variant",
          "labels": { "rectangular": "Rectangular", "round": "Round", "nesting_pair": "Nesting pair", "with_shelf": "With lower shelf" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "rectangular",
            "round",
            "nesting_pair",
            "with_shelf"
          ],
          "default": "rectangular"
        },
        {
          "key": "length",
          "label": "Length",
          "type": "number",
          "unit": "mm",
          "default": 1100,
          "min": 600,
          "max": 1400,
          "step": 10
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 400,
          "max": 800,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 350,
          "max": 500,
          "step": 10
        },
        {
          "key": "shelf",
          "label": "Shelf",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "top",
          "Top"
        ],
        [
          "legs",
          "Legs and shelf"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "round": {
          "length": 800,
          "width": 800
        },
        "nesting_pair": {
          "length": 900,
          "width": 550,
          "height": 450
        },
        "with_shelf": {
          "shelf": true
        }
      }
    },
    {
      "id": "side_table",
      "parameters": [
        {
          "key": "variant",
          "labels": { "round_pedestal": "Round pedestal table", "square": "Square table", "nightstand": "Nightstand" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "round_pedestal",
            "square",
            "nightstand"
          ],
          "default": "round_pedestal"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 350,
          "max": 600,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 350,
          "max": 600,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 550,
          "min": 450,
          "max": 650,
          "step": 10
        },
        {
          "key": "drawers",
          "appliesTo": ["nightstand"],
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 2
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "top",
          "Top"
        ],
        [
          "base",
          "Base and drawers"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "nightstand": {
          "width": 450,
          "depth": 400,
          "height": 550,
          "drawers": 1
        }
      }
    },
    {
      "id": "desk",
      "parameters": [
        {
          "key": "variant",
          "labels": { "straight": "Straight desk", "l_shaped": "L-shaped desk", "standing": "Standing desk" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "straight",
            "l_shaped",
            "standing"
          ],
          "default": "straight"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1400,
          "min": 1000,
          "max": 2000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 700,
          "min": 550,
          "max": 900,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 740,
          "min": 650,
          "max": 1250,
          "step": 10
        },
        {
          "key": "heightAdjustable",
          "label": "Height adjustable",
          "type": "boolean",
          "default": false
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "cornerSide",
          "appliesTo": ["l_shaped"],
          "label": "Corner side",
          "type": "enum",
          "options": [
            "left",
            "right"
          ],
          "default": "right"
        },
        {
          "key": "returnLength",
          "appliesTo": ["l_shaped"],
          "label": "Return length",
          "type": "number",
          "unit": "mm",
          "default": 1200,
          "min": 800,
          "max": 1800,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "top",
          "Top"
        ],
        [
          "frame",
          "Legs and drawers"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "l_shaped": {
          "width": 1600,
          "returnLength": 1200,
          "cornerSide": "right"
        },
        "standing": {
          "heightAdjustable": true,
          "height": 1100
        }
      },
      "notes": [
        "For `l_shaped`, a second top of the same depth runs forward from one end (`cornerSide`) to `returnLength` from the back edge. `cornerSide` and `returnLength` do nothing for the other variants."
      ]
    }
  ]
}
```

```json
{
  "category": "beds",
  "generators": [
    {
      "id": "bed",
      "parameters": [
        {
          "key": "variant",
          "labels": { "standard": "Standard bed", "platform": "Platform bed", "storage_bed": "Bed with storage", "bunk": "Bunk bed", "daybed": "Daybed", "cot": "Barred cot" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "standard",
            "platform",
            "storage_bed",
            "bunk",
            "daybed",
            "cot"
          ],
          "default": "standard"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "enum_number",
          "unit": "mm",
          "options": [
            600,
            900,
            1200,
            1500,
            1600,
            1800
          ],
          "default": 1500
        },
        {
          "key": "length",
          "label": "Length",
          "type": "enum_number",
          "unit": "mm",
          "options": [
            1200,
            2000,
            2100
          ],
          "default": 2000
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 500,
          "min": 350,
          "max": 1800,
          "step": 10
        },
        {
          "key": "headboard",
          "label": "Headboard",
          "type": "enum",
          "options": [
            "none",
            "low",
            "tall"
          ],
          "default": "low"
        },
        {
          "key": "footboard",
          "label": "Footboard",
          "type": "boolean",
          "default": false
        },
        {
          "key": "drawers",
          "appliesTo": ["standard", "platform", "storage_bed", "bunk", "daybed"],
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "frame",
          "Frame"
        ],
        [
          "mattress",
          "Mattress"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "storage_bed": {
          "drawers": 2,
          "height": 450
        },
        "bunk": {
          "width": 900,
          "height": 1700
        },
        "daybed": {
          "width": 900,
          "headboard": "low",
          "footboard": false
        },
        "cot": {
          "width": 600,
          "length": 1200,
          "height": 900,
          "headboard": "none",
          "footboard": false
        }
      },
      "notes": [
        "`height` is the top of the frame, or of the upper bed's rail for `bunk`, or of the bars for `cot`.",
        "`cot` is a child's cot (Swedish spjälsäng): bars on all four sides up to `height`, the mattress about 300 mm below the top."
      ]
    }
  ]
}
```

```json
{
  "category": "storage",
  "generators": [
    {
      "id": "wardrobe",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "hinged",
            "sliding",
            "open",
            "built_in_closet",
            "narrow"
          ],
          "labels": { "hinged": "Hinged wardrobe", "sliding": "Sliding-door wardrobe", "open": "Open wardrobe", "built_in_closet": "Built-in closet", "narrow": "Narrow wardrobe" },
          "default": "hinged"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1200,
          "min": 600,
          "max": 3000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 400,
          "max": 650,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 2200,
          "min": 2000,
          "max": 2500,
          "step": 10
        },
        {
          "key": "doors",
          "appliesTo": ["hinged", "sliding", "built_in_closet", "narrow"],
          "label": "Doors",
          "type": "integer",
          "default": 2,
          "min": 1,
          "max": 6
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "shelves",
          "label": "Shelves",
          "type": "integer",
          "default": 3,
          "min": 0,
          "max": 8
        },
        {
          "key": "hangingRail",
          "label": "Hanging rail",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "carcass",
          "Carcass"
        ],
        [
          "doors",
          "Doors"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "sliding": {
          "doors": 2
        },
        "built_in_closet": {
          "height": 2400,
          "width": 1500
        },
        "narrow": {
          "width": 600,
          "depth": 400
        }
      },
      "notes": [
        "The variant says how the doors open: `hinged`, `sliding` (two or more panels in front of each other), `open` (no doors). The doored variants have at least one door; the doors part exists for them only."
      ]
    },
    {
      "id": "chest_of_drawers",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "chest",
            "low_boy",
            "tall_boy"
          ],
          "default": "chest"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 600,
          "max": 1800,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 350,
          "max": 550,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 600,
          "max": 2000,
          "step": 10
        },
        {
          "key": "columns",
          "label": "Columns",
          "type": "integer",
          "default": 1,
          "min": 1,
          "max": 3
        },
        {
          "key": "rows",
          "label": "Rows",
          "type": "integer",
          "default": 4,
          "min": 2,
          "max": 7
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "carcass",
          "Carcass"
        ],
        [
          "drawers",
          "Drawer fronts"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "low_boy": {
          "height": 700,
          "rows": 3
        },
        "tall_boy": {
          "height": 1600,
          "rows": 6
        }
      }
    },
    {
      "id": "bookshelf",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "open",
            "glass_door",
            "corner_unit",
            "corner_glass_door",
            "string",
            "utility"
          ],
          "labels": { "open": "Open bookshelf", "glass_door": "Glass-door bookshelf", "corner_unit": "Corner bookshelf", "corner_glass_door": "Glass-door corner bookshelf", "string": "String-style wire shelving", "utility": "Utility shelving" },
          "default": "open"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 960,
          "min": 300,
          "max": 3000,
          "step": 10
        },
        {
          "key": "sideWidth",
          "appliesTo": ["corner_unit", "corner_glass_door"],
          "label": "Side width",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 600,
          "max": 3000,
          "step": 10
        },
        {
          "key": "columns",
          "appliesTo": ["open", "glass_door", "string", "utility"],
          "label": "Columns",
          "type": "integer",
          "default": 3,
          "min": 1,
          "max": 6
        },
        {
          "key": "frontColumns",
          "appliesTo": ["corner_unit", "corner_glass_door"],
          "label": "Front columns",
          "type": "integer",
          "default": 2,
          "min": 2,
          "max": 6
        },
        {
          "key": "sideColumns",
          "appliesTo": ["corner_unit", "corner_glass_door"],
          "label": "Side columns",
          "type": "integer",
          "default": 2,
          "min": 2,
          "max": 6
        },
        {
          "key": "rows",
          "label": "Rows",
          "type": "integer",
          "default": 5,
          "min": 1,
          "max": 8
        },
        {
          "key": "shelfSpacing",
          "label": "Shelf spacing",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 250,
          "max": 400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 250,
          "max": 400,
          "step": 10
        },
        {
          "key": "backPanel",
          "appliesTo": ["open", "glass_door", "corner_unit", "corner_glass_door"],
          "label": "Back panel",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "carcass",
          "Frame and shelves"
        ],
        [
          "glass",
          "Glass doors"
        ],
        [
          "wires",
          "Wire side panels"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "corner_unit": {
          "width": 1200,
          "rows": 6
        },
        "corner_glass_door": {
          "width": 1200,
          "rows": 6
        },
        "string": {
          "width": 1200,
          "columns": 2,
          "rows": 4
        },
        "utility": {
          "width": 970,
          "columns": 1,
          "rows": 5,
          "shelfSpacing": 400,
          "depth": 400,
          "material": "pine"
        }
      },
      "notes": [
        "`utility` is open storage shelving for a cellar or store room (Swedish förrådshylla): uprights at the corners, no back, no sides.",
        "`string` is String-style shelving (as the wall shelf's `string`): boards between wire ladder panels at every bay boundary, standing on the floor; the wires are their own part (`wires`). The bays adapt to the width (fewer columns are used when a bay would be under 150 mm); a corner unit has a front run (`width`, `frontColumns`) and a side run (`sideWidth`, `sideColumns`), at least two columns each. Glass doors are the variants `glass_door` and `corner_glass_door`; there is no separate glass option, because a part that is empty cannot apply to a variant. The glass part has the default material `glass` (`defaultMaterial` on the part), so it does not take the wood of the rest."
      ]
    },
    {
      "id": "sideboard",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "tv_bench",
            "sideboard",
            "skank"
          ],
          "default": "tv_bench"
        },
        {
          "key": "length",
          "label": "Length",
          "type": "number",
          "unit": "mm",
          "default": 1600,
          "min": 1000,
          "max": 2200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 420,
          "min": 350,
          "max": 500,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 350,
          "max": 850,
          "step": 10
        },
        {
          "key": "doors",
          "label": "Doors",
          "type": "integer",
          "default": 2,
          "min": 0,
          "max": 4
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "openShelf",
          "label": "Open shelf",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "carcass",
          "Carcass"
        ],
        [
          "doors",
          "Doors and drawers"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "tv_bench": {
          "length": 1500,
          "height": 450,
          "doors": 0,
          "drawers": 2,
          "openShelf": true
        },
        "sideboard": {
          "length": 1600,
          "height": 800,
          "doors": 2,
          "drawers": 2
        },
        "skank": {
          "length": 1200,
          "depth": 450,
          "height": 850,
          "doors": 2,
          "drawers": 2
        }
      },
      "notes": [
        "`skank` is the Swedish skänk: a traditional cupboard on a low plinth, two doors under a row of drawers."
      ]
    },
    {
      "id": "hallway_unit",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "shoe_cabinet",
            "coat_rack",
            "shoe_rack",
            "umbrella_stand"
          ],
          "default": "shoe_cabinet"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 200,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 350,
          "min": 250,
          "max": 450,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 300,
          "max": 1900,
          "step": 10
        },
        {
          "key": "hooks",
          "label": "Hooks",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 8
        },
        {
          "key": "shelves",
          "label": "Shelves",
          "type": "integer",
          "default": 2,
          "min": 0,
          "max": 6
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "body",
          "Body"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "coat_rack": {
          "width": 600,
          "depth": 400,
          "height": 1800,
          "hooks": 4
        },
        "shoe_rack": {
          "width": 800,
          "depth": 300,
          "height": 600
        },
        "umbrella_stand": {
          "width": 250,
          "depth": 250,
          "height": 500
        }
      },
      "notes": [
        "`coat_rack` stands on the floor (the wall-hung hat shelf is the wall shelf's `hat_shelf`)."
      ]
    },
    {
      "id": "kitchen_cabinet",
      "parameters": [
        {
          "key": "variant",
          "labels": { "base": "Base cabinet", "base_drawer": "Base cabinet with drawers", "upper": "Wall (upper) cabinet", "tall_pantry": "Tall pantry" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "base",
            "base_drawer",
            "upper",
            "tall_pantry"
          ],
          "default": "base"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "enum_number",
          "unit": "mm",
          "options": [
            300,
            400,
            450,
            500,
            600,
            800,
            900,
            1000,
            1200
          ],
          "default": 600
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 300,
          "max": 620,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 880,
          "min": 600,
          "max": 2400,
          "step": 10
        },
        {
          "key": "plinth",
          "appliesTo": ["base", "base_drawer", "tall_pantry"],
          "label": "Plinth",
          "type": "number",
          "unit": "mm",
          "default": 100,
          "min": 0,
          "max": 150,
          "step": 10
        },
        {
          "key": "doors",
          "label": "Doors",
          "type": "integer",
          "default": 1,
          "min": 0,
          "max": 2
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "glassDoors",
          "label": "Glass doors",
          "type": "boolean",
          "default": false
        },
        {
          "key": "worktop",
          "appliesTo": ["base", "base_drawer"],
          "label": "Worktop",
          "type": "boolean",
          "default": true
        },
        {
          "key": "worktopThickness",
          "appliesTo": ["base", "base_drawer"],
          "label": "Worktop thickness",
          "type": "number",
          "unit": "mm",
          "default": 30,
          "min": 12,
          "max": 60,
          "step": 2
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "carcass",
          "Carcass"
        ],
        [
          "doors",
          "Doors and drawer fronts"
        ],
        [
          "top",
          "Top (worktop on base cabinets)"
        ],
        [
          "glass",
          "Glass panes"
        ]
      ],
      "placement": {
        "mount": "floor",
        "variants": {
          "upper": {
            "mount": "wall",
            "z": 1450
          }
        }
      },
      "variant_defaults": {
        "base": {
          "depth": 600,
          "height": 880,
          "plinth": 100,
          "worktop": true
        },
        "base_drawer": {
          "depth": 600,
          "height": 880,
          "drawers": 3,
          "doors": 0,
          "worktop": true
        },
        "upper": {
          "depth": 350,
          "height": 800,
          "plinth": 0,
          "worktop": false
        },
        "tall_pantry": {
          "depth": 600,
          "height": 2200,
          "plinth": 100,
          "doors": 2,
          "worktop": false
        }
      },
      "notes": [
        "`height` is the carcass with its plinth. With `worktop` on, a top of `worktopThickness` lies on it and overhangs the front by 20 mm, so the whole height is `height` + `worktopThickness` (880 + 30 = the usual 910 in Sweden).",
        "`glassDoors` makes the doors glass panes in a frame (a glass-fronted upper cabinet)."
      ]
    },
    {
      "id": "workbench",
      "parameters": [
        {
          "key": "length",
          "label": "Length",
          "type": "number",
          "unit": "mm",
          "default": 1600,
          "min": 1000,
          "max": 2400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 500,
          "max": 800,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 800,
          "max": 1000,
          "step": 10
        },
        {
          "key": "shelf",
          "label": "Lower shelf",
          "type": "boolean",
          "default": true
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "pine"
        }
      ],
      "parts": [
        [
          "top",
          "Top"
        ],
        [
          "frame",
          "Frame and shelf"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "notes": [
        "A workshop bench (Swedish arbetsbänk): a thick top (40 mm) on four legs, an optional shelf 150 mm above the floor, drawers under the top at the front."
      ]
    },
    {
      "id": "wall_shelf",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "plain",
            "string",
            "hat_shelf"
          ],
          "default": "plain"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 800,
          "min": 400,
          "max": 2000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 250,
          "min": 150,
          "max": 400,
          "step": 10
        },
        {
          "key": "shelves",
          "label": "Shelves",
          "type": "integer",
          "default": 1,
          "min": 1,
          "max": 5
        },
        {
          "key": "shelfSpacing",
          "label": "Shelf spacing",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 200,
          "max": 400,
          "step": 10
        },
        {
          "key": "hooks",
          "label": "Hooks",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 12
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "shelves",
          "Shelves"
        ],
        [
          "brackets",
          "Brackets, side panels and hooks"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 1500,
        "variants": {
          "string": {
            "mount": "wall",
            "z": 900
          },
          "hat_shelf": {
            "mount": "wall",
            "z": 1650
          }
        }
      },
      "variant_defaults": {
        "string": {
          "shelves": 3,
          "depth": 300
        },
        "hat_shelf": {
          "width": 1000,
          "depth": 300,
          "shelves": 1,
          "hooks": 6
        }
      },
      "notes": [
        "`plain`: shelves on two brackets each. `string` (the Swedish String shelf): shelves between two thin wire side panels hung on the wall. `hat_shelf` (Swedish hatthylla): one slatted shelf with a rail of `hooks` under it.",
        "The model's back is against the wall at +y; its bottom is the lowest shelf or the hook rail."
      ]
    }
  ]
}
```

```json
{
  "category": "kitchen",
  "generators": [
    {
      "id": "appliance",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "fridge_freezer",
            "fridge",
            "freezer",
            "range_cooker",
            "dishwasher",
            "oven",
            "hob",
            "washing_machine",
            "dryer",
            "drying_cabinet",
            "range_hood",
            "microwave"
          ],
          "default": "fridge_freezer"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 300,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 400,
          "max": 700,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 820,
          "min": 40,
          "max": 2000,
          "step": 10
        },
        {
          "key": "builtIn",
          "label": "Built in",
          "type": "boolean",
          "default": true
        },
        {
          "key": "hobType",
          "label": "Hob type",
          "type": "enum",
          "options": [
            "induction",
            "electric",
            "gas"
          ],
          "default": "induction"
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "body",
          "Body"
        ],
        [
          "front",
          "Door and front"
        ]
      ],
      "placement": {
        "mount": "floor",
        "variants": {
          "hob": {
            "mount": "floor",
            "z": 860
          },
          "microwave": {
            "mount": "floor",
            "z": 910
          },
          "range_hood": {
            "mount": "wall",
            "z": 1550
          }
        }
      },
      "variant_defaults": {
        "fridge_freezer": {
          "width": 600,
          "depth": 600,
          "height": 1850
        },
        "fridge": {
          "width": 600,
          "depth": 650,
          "height": 1850
        },
        "freezer": {
          "width": 600,
          "depth": 650,
          "height": 1850
        },
        "range_cooker": {
          "width": 600,
          "depth": 600,
          "height": 850,
          "builtIn": false
        },
        "dishwasher": {
          "width": 600,
          "depth": 600,
          "height": 820
        },
        "oven": {
          "width": 600,
          "depth": 600,
          "height": 600
        },
        "hob": {
          "width": 600,
          "depth": 520,
          "height": 50
        },
        "washing_machine": {
          "width": 600,
          "depth": 600,
          "height": 850,
          "builtIn": false
        },
        "dryer": {
          "width": 600,
          "depth": 600,
          "height": 850,
          "builtIn": false
        },
        "drying_cabinet": {
          "width": 600,
          "depth": 600,
          "height": 1850,
          "builtIn": false
        },
        "range_hood": {
          "width": 600,
          "depth": 450,
          "height": 150
        },
        "microwave": {
          "width": 600,
          "depth": 400,
          "height": 380,
          "builtIn": false
        }
      },
      "notes": [
        "`range_cooker` is the freestanding Swedish spis: an oven with a hob on top, 600 wide. `drying_cabinet` is a torkskåp, a tall cabinet for drying laundry.",
        "`hobType` only changes the `hob` and `range_cooker` tops."
      ]
    },
    {
      "id": "sink",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "single_bowl",
            "double_bowl",
            "utility_tub"
          ],
          "default": "single_bowl"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 400,
          "max": 1000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 380,
          "max": 500,
          "step": 10
        },
        {
          "key": "bowls",
          "label": "Bowls",
          "type": "integer",
          "default": 1,
          "min": 1,
          "max": 2
        },
        {
          "key": "drainSide",
          "label": "Drain side",
          "type": "enum",
          "options": [
            "left",
            "center",
            "right"
          ],
          "default": "center"
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 200,
          "min": 150,
          "max": 950,
          "step": 10
        },
        {
          "key": "legs",
          "label": "Legs",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "metal"
        }
      ],
      "parts": [
        [
          "basin",
          "Basin"
        ],
        [
          "frame",
          "Legs"
        ]
      ],
      "placement": {
        "mount": "floor",
        "z": 710,
        "variants": {
          "utility_tub": {
            "mount": "floor"
          }
        }
      },
      "variant_defaults": {
        "double_bowl": {
          "bowls": 2,
          "width": 800
        },
        "utility_tub": {
          "width": 600,
          "depth": 500,
          "height": 900,
          "legs": true,
          "bowls": 1
        }
      },
      "notes": [
        "Without legs the model is the basin alone (`height` from its bottom to the rim), set into a worktop: the house places it so the rim is at the worktop.",
        "`utility_tub` is a laundry sink (Swedish tvättho) standing on four legs: `height` is the rim above the floor."
      ]
    },
    {
      "id": "kitchen_island",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "plain",
            "seating_overhang",
            "with_sink",
            "with_hob"
          ],
          "default": "plain"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1500,
          "min": 1200,
          "max": 1800,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 800,
          "min": 600,
          "max": 900,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 850,
          "max": 920,
          "step": 10
        },
        {
          "key": "overhang",
          "label": "Overhang",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 250,
          "max": 350,
          "step": 10
        },
        {
          "key": "seats",
          "label": "Seats",
          "type": "integer",
          "default": 0,
          "min": 0,
          "max": 4
        },
        {
          "key": "sink",
          "label": "Sink",
          "type": "boolean",
          "default": false
        },
        {
          "key": "hob",
          "label": "Hob",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "carcass",
          "Carcass"
        ],
        [
          "top",
          "Top"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "seating_overhang": {
          "seats": 2,
          "overhang": 300
        },
        "with_sink": {
          "sink": true
        },
        "with_hob": {
          "hob": true
        }
      }
    }
  ]
}
```

```json
{
  "category": "bathroom",
  "generators": [
    {
      "id": "toilet",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "wall_hung",
            "floor_standing"
          ],
          "default": "wall_hung"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 360,
          "min": 350,
          "max": 400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 530,
          "min": 500,
          "max": 700,
          "step": 10
        },
        {
          "key": "seatHeight",
          "label": "Seat height",
          "type": "number",
          "unit": "mm",
          "default": 400,
          "min": 380,
          "max": 440,
          "step": 10
        },
        {
          "key": "concealedCistern",
          "label": "Concealed cistern",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "ceramic"
        }
      ],
      "parts": [
        [
          "bowl",
          "Bowl and cistern"
        ],
        [
          "seat",
          "Seat"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "floor_standing": {
          "concealedCistern": false,
          "depth": 680
        }
      },
      "notes": [
        "A wall-hung toilet is modelled from the floor (its bowl hangs above it, against the wall at the back), so it starts at z 0 like the others."
      ]
    },
    {
      "id": "bathtub",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "alcove",
            "freestanding",
            "corner"
          ],
          "default": "alcove"
        },
        {
          "key": "length",
          "label": "Length",
          "type": "number",
          "unit": "mm",
          "default": 1700,
          "min": 1400,
          "max": 1900,
          "step": 10
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 750,
          "min": 650,
          "max": 1500,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 550,
          "min": 450,
          "max": 650,
          "step": 10
        },
        {
          "key": "wallSide",
          "label": "Wall side",
          "type": "enum",
          "options": [
            "left",
            "right",
            "back",
            "none"
          ],
          "default": "back"
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "ceramic"
        }
      ],
      "parts": [
        [
          "tub",
          "Tub"
        ],
        [
          "panel",
          "Front panel"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "freestanding": {
          "wallSide": "none",
          "length": 1700,
          "width": 800
        },
        "corner": {
          "wallSide": "back",
          "length": 1500,
          "width": 1500
        }
      }
    },
    {
      "id": "shower",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "walk_in",
            "enclosed_stall",
            "corner"
          ],
          "default": "walk_in"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 800,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 800,
          "max": 1200,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 2000,
          "min": 1900,
          "max": 2200,
          "step": 10
        },
        {
          "key": "doorType",
          "label": "Door type",
          "type": "enum",
          "options": [
            "none",
            "hinged",
            "sliding",
            "pivot"
          ],
          "default": "hinged"
        },
        {
          "key": "doorWidth",
          "label": "Door width",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 700,
          "max": 1200,
          "step": 10
        },
        {
          "key": "floorDrain",
          "label": "Floor drain",
          "type": "boolean",
          "default": true
        },
        {
          "key": "drainPosition",
          "label": "Drain position",
          "type": "enum",
          "options": [
            "center",
            "corner",
            "wall"
          ],
          "default": "center"
        },
        {
          "key": "curbHeight",
          "label": "Curb height",
          "type": "number",
          "unit": "mm",
          "default": 0,
          "min": 0,
          "max": 150,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "glass"
        }
      ],
      "parts": [
        [
          "base",
          "Floor tray or curb"
        ],
        [
          "screen",
          "Glass walls"
        ],
        [
          "door",
          "Door"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "walk_in": {
          "doorType": "none",
          "curbHeight": 0,
          "width": 1200,
          "depth": 900
        },
        "enclosed_stall": {
          "doorType": "hinged",
          "curbHeight": 50
        },
        "corner": {
          "doorType": "pivot",
          "width": 900,
          "depth": 900
        }
      },
      "notes": [
        "The door is its own part, `door`. With `doorType` none the part is empty (return an empty geometry).",
        "`walk_in` is a single fixed glass screen (Swedish duschvägg); `corner` is two glass walls meeting at a corner, the door in one of them (duschhörna)."
      ]
    },
    {
      "id": "vanity",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "single_sink",
            "double_sink",
            "pedestal",
            "wall_mounted",
            "with_cabinet"
          ],
          "default": "single_sink"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 700,
          "min": 500,
          "max": 1400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 460,
          "min": 400,
          "max": 550,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 850,
          "min": 800,
          "max": 900,
          "step": 10
        },
        {
          "key": "bowls",
          "label": "Bowls",
          "type": "integer",
          "default": 1,
          "min": 1,
          "max": 2
        },
        {
          "key": "doors",
          "label": "Doors",
          "type": "integer",
          "default": 1,
          "min": 0,
          "max": 4
        },
        {
          "key": "drawers",
          "label": "Drawers",
          "type": "integer",
          "default": 1,
          "min": 0,
          "max": 3
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "cabinet",
          "Cabinet"
        ],
        [
          "basin",
          "Basin"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "double_sink": {
          "width": 1300,
          "bowls": 2,
          "doors": 2
        },
        "pedestal": {
          "doors": 0,
          "drawers": 0
        },
        "wall_mounted": {
          "height": 800
        },
        "with_cabinet": {
          "doors": 2,
          "drawers": 1
        }
      },
      "notes": [
        "`height` is the top of the basin. `wall_mounted` hangs on the wall with nothing under it; it is still modelled from the floor (the space under it empty), so it starts at z 0."
      ]
    },
    {
      "id": "towel_rail",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "ladder",
            "wall_bar"
          ],
          "default": "ladder"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 500,
          "min": 400,
          "max": 600,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 800,
          "min": 40,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 100,
          "min": 60,
          "max": 120,
          "step": 10
        },
        {
          "key": "heated",
          "label": "Heated",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "metal"
        }
      ],
      "parts": [
        [
          "frame",
          "Rails and brackets"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 900,
        "variants": {
          "wall_bar": {
            "mount": "wall",
            "z": 1100
          }
        }
      },
      "variant_defaults": {
        "ladder": {
          "height": 1100,
          "width": 500,
          "heated": true
        },
        "wall_bar": {
          "heated": false,
          "height": 60
        }
      },
      "notes": [
        "`heated` (an electric or water-heated rail) does not change the shape much: a heated ladder has a thicker frame and a cable or pipe stub at the bottom."
      ]
    },
    {
      "id": "mirror",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "rectangular",
            "round",
            "backlit",
            "medicine_cabinet"
          ],
          "default": "rectangular"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 300,
          "max": 1200,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 800,
          "min": 300,
          "max": 1400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 30,
          "min": 20,
          "max": 150,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "glass"
        }
      ],
      "parts": [
        [
          "glass",
          "Mirror"
        ],
        [
          "frame",
          "Frame or cabinet"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 1100
      },
      "variant_defaults": {
        "round": {
          "width": 600,
          "height": 600
        },
        "medicine_cabinet": {
          "depth": 120,
          "height": 700
        }
      },
      "notes": [
        "`medicine_cabinet` is a mirror cabinet (Swedish spegelskåp): a box `depth` deep with mirror doors."
      ]
    }
  ]
}
```

```json
{
  "category": "lighting",
  "generators": [
    {
      "id": "ceiling_light",
      "parameters": [
        {
          "key": "variant",
          "labels": { "flush": "Flush ceiling light", "pendant": "Pendant", "chandelier": "Chandelier", "recessed_downlight": "Recessed downlight", "track_light": "Track light" },
          "label": "Variant",
          "type": "enum",
          "options": [
            "flush",
            "pendant",
            "chandelier",
            "recessed_downlight",
            "track_light"
          ],
          "default": "flush"
        },
        {
          "key": "diameter",
          "label": "Diameter",
          "type": "number",
          "unit": "mm",
          "default": 350,
          "min": 60,
          "max": 1000,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 150,
          "min": 10,
          "max": 600,
          "step": 10
        },
        {
          "key": "dropLength",
          "appliesTo": ["pendant", "chandelier"],
          "label": "Drop length",
          "type": "number",
          "unit": "mm",
          "default": 0,
          "min": 0,
          "max": 2000,
          "step": 10
        },
        {
          "key": "arms",
          "appliesTo": ["chandelier"],
          "label": "Chandelier arms",
          "type": "enum_number",
          "options": [
            3,
            6
          ],
          "default": 6
        },
        {
          "key": "headDirection",
          "appliesTo": ["chandelier"],
          "label": "Chandelier heads point",
          "type": "enum",
          "options": [
            "up",
            "down"
          ],
          "default": "up"
        },
        {
          "key": "shadeShape",
          "label": "Shade shape",
          "type": "enum",
          "options": [
            "drum",
            "cone",
            "globe",
            "bell",
            "bare_bulb"
          ],
          "default": "drum"
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "fitting",
          "Canopy, cord and fitting"
        ],
        [
          "shade",
          "Shade"
        ]
      ],
      "placement": {
        "mount": "ceiling"
      },
      "variant_defaults": {
        "pendant": {
          "diameter": 400,
          "dropLength": 1000,
          "shadeShape": "cone",
          "height": 250
        },
        "chandelier": {
          "diameter": 700,
          "dropLength": 800,
          "shadeShape": "bare_bulb"
        },
        "recessed_downlight": {
          "diameter": 90,
          "height": 20,
          "dropLength": 0
        },
        "track_light": {
          "diameter": 60,
          "height": 150
        }
      },
      "notes": [
        "The top of the model is the ceiling: the canopy at the top, the cord `dropLength` long, the shade below it. The whole height is the cord plus the shade (`height`)."
      ]
    },
    {
      "id": "table_lamp",
      "parameters": [
        {
          "key": "variant",
          "label": "Form",
          "type": "enum",
          "options": [
            "classic",
            "sill",
            "candlestick",
            "orb",
            "desk_arm"
          ],
          "labels": { "classic": "Classic table lamp", "sill": "Small sill lamp", "candlestick": "Candlestick lamp", "orb": "Glass orb lamp", "desk_arm": "Adjustable desk lamp" },
          "default": "classic"
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 250,
          "max": 600,
          "step": 10
        },
        {
          "key": "shadeDiameter",
          "label": "Shade diameter",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 150,
          "max": 450,
          "step": 10
        },
        {
          "key": "shadeShape",
          "appliesTo": ["classic", "sill", "candlestick", "desk_arm"],
          "label": "Shade shape",
          "type": "enum",
          "options": [
            "drum",
            "cone",
            "empire",
            "globe"
          ],
          "labels": { "drum": "Drum (straight)", "cone": "Cone (narrow top)", "empire": "Empire (slightly tapered)", "globe": "Globe" },
          "default": "drum"
        },
        {
          "key": "baseShape",
          "appliesTo": ["classic", "sill", "candlestick", "desk_arm"],
          "label": "Base shape",
          "type": "enum",
          "options": [
            "ceramic",
            "pole",
            "sphere",
            "baluster"
          ],
          "labels": { "ceramic": "Ceramic vase", "pole": "Pole", "sphere": "Ball", "baluster": "Turned baluster" },
          "default": "ceramic"
        },
        {
          "key": "armLength",
          "appliesTo": ["desk_arm"],
          "label": "Arm length",
          "type": "number",
          "unit": "mm",
          "default": 0,
          "min": 0,
          "max": 800,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "ceramic"
        }
      ],
      "parts": [
        [
          "base",
          "Base and stem"
        ],
        [
          "shade",
          "Shade"
        ]
      ],
      "placement": {
        "mount": "floor",
        "z": 720
      },
      "variant_defaults": {
        "sill": {
          "height": 280,
          "shadeDiameter": 170
        },
        "candlestick": {
          "height": 520,
          "shadeDiameter": 200,
          "shadeShape": "empire",
          "baseShape": "baluster"
        },
        "orb": {
          "height": 300,
          "shadeDiameter": 180
        },
        "desk_arm": {
          "armLength": 500,
          "height": 400,
          "shadeDiameter": 200,
          "shadeShape": "cone",
          "baseShape": "pole"
        }
      },
      "notes": [
        "The variant is the form of the lamp; the shade shape (drum, cone, empire, globe) is a separate choice. The bedside lamp is the classic form with an empire shade (decision 240). It stands on a table: it starts 720 mm up. The sill form is small enough for a window sill (placement in a window comes from the window, docs/plans)."
      ]
    },
    {
      "id": "floor_lamp",
      "parameters": [
        {
          "key": "variant",
          "label": "Form",
          "type": "enum",
          "options": [
            "arc",
            "torchiere",
            "tripod",
            "standard"
          ],
          "labels": { "arc": "Arc lamp", "torchiere": "Torchiere (uplighter)", "tripod": "Tripod lamp", "standard": "Standard lamp" },
          "default": "arc"
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 1600,
          "min": 1400,
          "max": 2000,
          "step": 10
        },
        {
          "key": "shadeDiameter",
          "label": "Shade diameter",
          "type": "number",
          "unit": "mm",
          "default": 400,
          "min": 250,
          "max": 600,
          "step": 10
        },
        {
          "key": "shadeShape",
          "appliesTo": ["arc", "tripod", "standard"],
          "label": "Shade shape",
          "type": "enum",
          "options": [
            "drum",
            "cone",
            "empire"
          ],
          "labels": { "drum": "Drum (straight)", "cone": "Cone (narrow top)", "empire": "Empire (slightly tapered)" },
          "default": "drum"
        },
        {
          "key": "baseDiameter",
          "label": "Base diameter",
          "type": "number",
          "unit": "mm",
          "default": 350,
          "min": 200,
          "max": 500,
          "step": 10
        },
        {
          "key": "arcReach",
          "appliesTo": ["arc"],
          "label": "Arc reach",
          "type": "number",
          "unit": "mm",
          "default": 0,
          "min": 0,
          "max": 1800,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "black-metal"
        }
      ],
      "parts": [
        [
          "stand",
          "Base and stand"
        ],
        [
          "shade",
          "Shade"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "arc": {
          "arcReach": 1200,
          "height": 1900,
          "baseDiameter": 400,
          "shadeShape": "cone"
        },
        "torchiere": {
          "shadeDiameter": 350,
          "height": 1800
        },
        "tripod": {
          "baseDiameter": 500,
          "height": 1500,
          "shadeShape": "empire"
        }
      }
    },
    {
      "id": "wall_sconce",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "up_down",
            "single",
            "swing_arm"
          ],
          "default": "up_down"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 200,
          "min": 100,
          "max": 300,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 250,
          "min": 100,
          "max": 400,
          "step": 10
        },
        {
          "key": "projection",
          "label": "Projection",
          "type": "number",
          "unit": "mm",
          "default": 230,
          "min": 50,
          "max": 400,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "mount",
          "Wall plate and arm"
        ],
        [
          "shade",
          "Shade"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 1600
      },
      "variant_defaults": {
        "swing_arm": {
          "projection": 350
        }
      },
      "notes": [
        "The head is always round and as wide as the width; projection (the distance from the wall to the front of the head) only sets the length of the arm, and is raised to the plate plus the head width when it is smaller (a swing arm keeps at least 80 mm of arm)."
      ]
    }
  ]
}
```

```json
{
  "category": "heating_and_misc",
  "generators": [
    {
      "id": "radiator",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "panel",
            "column"
          ],
          "default": "panel"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 400,
          "max": 2000,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 300,
          "max": 900,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 80,
          "min": 60,
          "max": 160,
          "step": 10
        },
        {
          "key": "panels",
          "label": "Panels",
          "type": "integer",
          "default": 2,
          "min": 1,
          "max": 3
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "body",
          "Panels"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 150
      },
      "variant_defaults": {
        "column": {
          "panels": 1,
          "height": 600,
          "depth": 100
        }
      }
    },
    {
      "id": "tile_stove",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "corner",
            "freestanding",
            "round"
          ],
          "default": "corner"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1200,
          "min": 700,
          "max": 1800,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 450,
          "max": 900,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 2300,
          "min": 2100,
          "max": 2500,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "ceramic"
        }
      ],
      "parts": [
        [
          "body",
          "Stove"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "corner": {
          "width": 900,
          "depth": 900
        },
        "round": {
          "width": 800,
          "depth": 800
        }
      },
      "notes": [
        "A Swedish kakelugn. `round` is a cylinder `width` across (depth equal) on a low foot, with a cornice at the top; the square ones are boxes with a plinth and a cornice."
      ]
    },
    {
      "id": "wood_stove",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "freestanding",
            "corner"
          ],
          "default": "freestanding"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 480,
          "min": 400,
          "max": 600,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 480,
          "min": 400,
          "max": 600,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 700,
          "min": 550,
          "max": 850,
          "step": 10
        },
        {
          "key": "flueOutlet",
          "label": "Flue outlet",
          "type": "enum",
          "options": [
            "top",
            "rear"
          ],
          "default": "top"
        },
        {
          "key": "flueDiameter",
          "label": "Flue diameter",
          "type": "number",
          "unit": "mm",
          "default": 150,
          "min": 100,
          "max": 200,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "charcoal"
        }
      ],
      "parts": [
        [
          "body",
          "Stove"
        ],
        [
          "flue",
          "Flue pipe"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "notes": [
        "The flue is a short pipe stub (300 mm) at the top or the back, `flueDiameter` across. Model the glass door as a recess in the front."
      ]
    },
    {
      "id": "heat_pump_indoor",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "wall_mounted",
            "floor_standing"
          ],
          "default": "wall_mounted"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 550,
          "max": 1000,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 280,
          "min": 250,
          "max": 700,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 330,
          "min": 300,
          "max": 1900,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "body",
          "Body"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 2000,
        "variants": {
          "floor_standing": {
            "mount": "floor"
          }
        }
      },
      "variant_defaults": {
        "floor_standing": {
          "width": 600,
          "depth": 650,
          "height": 1800
        }
      },
      "notes": [
        "`wall_mounted` is the indoor unit of an air heat pump; `floor_standing` is a ground-source heat pump (Swedish bergvärmepump), a tall cabinet in the utility room."
      ]
    },
    {
      "id": "rug",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "rectangular",
            "round",
            "runner"
          ],
          "default": "rectangular"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 2000,
          "min": 600,
          "max": 3000,
          "step": 10
        },
        {
          "key": "length",
          "label": "Length",
          "type": "number",
          "unit": "mm",
          "default": 3000,
          "min": 600,
          "max": 4000,
          "step": 10
        },
        {
          "key": "pileThickness",
          "label": "Pile thickness",
          "type": "number",
          "unit": "mm",
          "default": 10,
          "min": 3,
          "max": 30,
          "step": 1
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "fabric"
        }
      ],
      "parts": [
        [
          "rug",
          "Rug"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "round": {
          "width": 1500,
          "length": 1500
        },
        "runner": {
          "width": 700,
          "length": 2000
        }
      }
    },
    {
      "id": "planter",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "pot",
            "hanging"
          ],
          "default": "pot"
        },
        {
          "key": "diameter",
          "label": "Diameter",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 100,
          "max": 600,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 400,
          "min": 100,
          "max": 2000,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "ceramic"
        }
      ],
      "parts": [
        [
          "pot",
          "Pot"
        ]
      ],
      "placement": {
        "mount": "floor",
        "variants": {
          "hanging": {
            "mount": "ceiling"
          }
        }
      },
      "variant_defaults": {
        "hanging": {
          "diameter": 200,
          "height": 200
        }
      },
      "notes": [
        "The pot only; the plant is not modelled. `hanging` hangs from the ceiling on three cords (500 mm), so the model's top is where the cords meet."
      ]
    },
    {
      "id": "water_heater",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "floor_standing",
            "wall_hung"
          ],
          "default": "floor_standing"
        },
        {
          "key": "diameter",
          "label": "Diameter",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 350,
          "max": 750,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 1800,
          "min": 500,
          "max": 2000,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "tank",
          "Tank"
        ]
      ],
      "placement": {
        "mount": "floor",
        "variants": {
          "wall_hung": {
            "mount": "wall",
            "z": 1000
          }
        }
      },
      "variant_defaults": {
        "wall_hung": {
          "diameter": 450,
          "height": 900
        }
      },
      "notes": [
        "A hot-water heater (Swedish varmvattenberedare): a cylinder standing on three short feet, or hung on the wall. 600 × 1800 holds about 300 litres."
      ]
    },
    {
      "id": "sauna_heater",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "electric",
            "wood_fired"
          ],
          "default": "electric"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 400,
          "min": 300,
          "max": 600,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 250,
          "max": 650,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 650,
          "min": 450,
          "max": 950,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "black-metal"
        }
      ],
      "parts": [
        [
          "body",
          "Heater"
        ],
        [
          "stones",
          "Stones"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 200,
        "variants": {
          "wood_fired": {
            "mount": "floor"
          }
        }
      },
      "variant_defaults": {
        "wood_fired": {
          "width": 450,
          "depth": 550,
          "height": 800
        }
      },
      "notes": [
        "A sauna heater (Swedish bastuaggregat). The stones are a heap on top, inside a low rim (their own part). `electric` hangs on the wall; `wood_fired` stands on the floor with a fire door at the front and a flue stub on top."
      ]
    }
  ]
}
```

```json
{
  "category": "electronics",
  "generators": [
    {
      "id": "tv",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "on_stand",
            "wall_mounted"
          ],
          "default": "on_stand"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1230,
          "min": 700,
          "max": 2000,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 710,
          "min": 400,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Panel depth",
          "type": "number",
          "unit": "mm",
          "default": 40,
          "min": 20,
          "max": 100,
          "step": 5
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "charcoal"
        }
      ],
      "parts": [
        [
          "screen",
          "Screen"
        ],
        [
          "stand",
          "Stand"
        ]
      ],
      "placement": {
        "mount": "floor",
        "z": 450,
        "variants": {
          "wall_mounted": {
            "mount": "wall",
            "z": 900
          }
        }
      },
      "notes": [
        "A flat-screen TV (1230 × 710 is a 55-inch screen). `on_stand` has a foot about 250 deep under it (the stand part, empty for `wall_mounted`); `height` is the screen alone. It starts on a TV bench (450 up) or on the wall."
      ]
    }
  ]
}
```

```json
{
  "category": "misc",
  "generators": [
    {
      "id": "cat_tree",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "tension_pole",
            "freestanding"
          ],
          "default": "tension_pole"
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 2400,
          "min": 800,
          "max": 3200,
          "step": 10
        },
        {
          "key": "platforms",
          "label": "Platforms",
          "type": "integer",
          "default": 4,
          "min": 2,
          "max": 6
        },
        {
          "key": "platformSize",
          "label": "Platform size",
          "type": "number",
          "unit": "mm",
          "default": 400,
          "min": 300,
          "max": 550,
          "step": 10
        },
        {
          "key": "postDiameter",
          "label": "Post diameter",
          "type": "number",
          "unit": "mm",
          "default": 90,
          "min": 60,
          "max": 140,
          "step": 5
        },
        {
          "key": "baseSize",
          "label": "Base size",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 400,
          "max": 800,
          "step": 10
        },
        {
          "key": "cave",
          "label": "Cave",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "fabric"
        }
      ],
      "variant_defaults": {
        "freestanding": {
          "height": 1500
        }
      },
      "parts": [
        [
          "post",
          "Post"
        ],
        [
          "platforms",
          "Platforms"
        ],
        [
          "base",
          "Base and ceiling plate"
        ],
        [
          "cave",
          "Cave"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "notes": [
        "A cat climbing tree. `tension_pole` runs from the floor to the ceiling (the height is the ceiling height; a plate at each end, the platforms spaced evenly below the top 450 mm); `freestanding` stands on a round base with the top platform on the post. The platforms are discs set round the post at changing angles. `baseSize` is the freestanding base only. The cave is a small hollow box with a round entrance on the second platform (a part that exists only when `cave` is on). The post is wrapped in sisal in reality: it defaults to the library's birch until a sisal material is added."
      ]
    },
    {
      "id": "chest",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "blanket_chest",
            "trunk",
            "toy_box"
          ],
          "default": "blanket_chest"
        },
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 1000,
          "min": 400,
          "max": 1500,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 300,
          "max": 700,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 450,
          "min": 300,
          "max": 900,
          "step": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "pine"
        }
      ],
      "variant_defaults": {
        "trunk": {
          "width": 900,
          "depth": 500,
          "height": 600
        },
        "toy_box": {
          "width": 800,
          "depth": 400,
          "height": 450
        }
      },
      "parts": [
        [
          "body",
          "Body"
        ],
        [
          "lid",
          "Lid"
        ],
        [
          "fittings",
          "Bands and lock"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "notes": [
        "A storage chest (Swedish kista). `blanket_chest` has a flat 30 mm lid on a 60 mm plinth and a lock plate; `trunk` has an arched lid and two metal straps over it; `toy_box` is a plain low box with a flat lid and a hand slot in each end (no fittings). The lid is closed; the overall width, depth and height are exact."
      ]
    }
  ]
}
```

```json
{
  "category": "electronics",
  "generators": [
    {
      "id": "desk_setup",
      "parameters": [
        {
          "key": "diagonal",
          "label": "Monitor size (diagonal)",
          "type": "enum_number",
          "unit": "in",
          "options": [
            22,
            24,
            27,
            32,
            34
          ],
          "default": 27
        },
        {
          "key": "speakers",
          "label": "Speakers",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "charcoal"
        }
      ],
      "parts": [
        [
          "monitor",
          "Monitor housing"
        ],
        [
          "screen",
          "Screen"
        ],
        [
          "stand",
          "Monitor stand"
        ],
        [
          "keyboard",
          "Keyboard"
        ],
        [
          "keys",
          "Keys"
        ],
        [
          "mouse",
          "Mouse"
        ],
        [
          "speakers",
          "Speakers"
        ]
      ],
      "placement": {
        "mount": "floor",
        "z": 740
      },
      "notes": [
        "A computer workplace for a desk (issue #34): a 16:9 monitor on a stand, a keyboard and a mouse in front of it, and a speaker on each side. The monitor size is its diagonal in inches (27 by default). It starts on a desk top (740 up). Cables and ports are omitted."
      ]
    }
  ]
}
```

```json
{
  "category": "misc",
  "generators": [
    {
      "id": "waste_bin",
      "parameters": [
        {
          "key": "variant",
          "label": "Variant",
          "type": "enum",
          "options": [
            "round",
            "rectangular",
            "pedal"
          ],
          "default": "round"
        },
        {
          "key": "width",
          "label": "Width (diameter if round)",
          "type": "number",
          "unit": "mm",
          "default": 260,
          "min": 150,
          "max": 600,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 250,
          "min": 150,
          "max": 600,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 300,
          "min": 150,
          "max": 900,
          "step": 10
        },
        {
          "key": "lid",
          "label": "Lid",
          "type": "boolean",
          "default": false
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "body",
          "Bin"
        ],
        [
          "lid",
          "Lid"
        ],
        [
          "pedal",
          "Foot pedal"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "variant_defaults": {
        "round": {
          "width": 260,
          "height": 300
        },
        "rectangular": {
          "width": 300,
          "depth": 250,
          "height": 350
        },
        "pedal": {
          "width": 300,
          "height": 600,
          "lid": true
        }
      },
      "notes": [
        "A small waste bin (a trash can): round, rectangular, or a round pedal bin with a lid. The lid is optional; an open bin is hollow. Swing lids, handles and inner buckets are omitted."
      ]
    }
  ]
}
```

```json
{
  "category": "heating and misc",
  "generators": [
    {
      "id": "radiator_cover",
      "parameters": [
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 400,
          "max": 2000,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 900,
          "min": 300,
          "max": 1200,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 180,
          "min": 100,
          "max": 300,
          "step": 10
        },
        {
          "key": "frontStyle",
          "label": "Front",
          "type": "enum",
          "options": [
            "grille",
            "slats",
            "cane"
          ],
          "default": "grille"
        },
        {
          "key": "shelf",
          "label": "Shelf on top",
          "type": "boolean",
          "default": true
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "white-paint"
        }
      ],
      "parts": [
        [
          "frame",
          "Casing"
        ],
        [
          "front",
          "Front panel"
        ],
        [
          "top",
          "Shelf"
        ]
      ],
      "placement": {
        "mount": "floor"
      },
      "notes": [
        "A casing over a wall radiator (radiatorskydd): side panels, rails, an open back and a perforated front (slots, slats or a cane weave), with an optional shelf on top. The radiator and a hinged front are omitted."
      ]
    }
  ]
}
```

```json
{
  "category": "storage",
  "generators": [
    {
      "id": "hook_rack",
      "parameters": [
        {
          "key": "width",
          "label": "Width",
          "type": "number",
          "unit": "mm",
          "default": 600,
          "min": 200,
          "max": 1500,
          "step": 10
        },
        {
          "key": "height",
          "label": "Height",
          "type": "number",
          "unit": "mm",
          "default": 120,
          "min": 80,
          "max": 400,
          "step": 10
        },
        {
          "key": "depth",
          "label": "Depth",
          "type": "number",
          "unit": "mm",
          "default": 90,
          "min": 60,
          "max": 150,
          "step": 10
        },
        {
          "key": "hooks",
          "label": "Hooks",
          "type": "integer",
          "default": 5,
          "min": 1,
          "max": 10
        },
        {
          "key": "material",
          "label": "Material (whole object)",
          "type": "material",
          "default": "oak"
        }
      ],
      "parts": [
        [
          "board",
          "Board"
        ],
        [
          "hooks",
          "Hooks"
        ]
      ],
      "placement": {
        "mount": "wall",
        "z": 1500
      },
      "notes": [
        "A board on the wall with a row of coat hooks (hatthylla without the shelf, a krokbräda). Evenly spaced hooks, each with an upturned tip and a knob."
      ]
    }
  ]
}
```
