/*

TODO: Save setting for selected color style and checked styles to export
- Use figma.clientStorage, but will need to call the backend for getting the value.

*/
figma.showUI(__html__, { width: 400, height: 400 });
// Messages from the UI
figma.ui.onmessage = function (msg) {
    switch (msg.type) {
        case "generate":
            Generate(msg.options);
            break;
        case "copy":
            CopyToClipboard();
            break;
        case "cancel":
            figma.closePlugin();
            break;
        case "get-base":
            GetBaseStyle();
            break;
        case "message":
            SendMessage(msg.message);
            break;
        default:
            break;
    }
};
function GetBaseStyle() {
    var textStyles = figma.getLocalTextStyles().map(function (textStyle) {
        return {
            name: textStyle.name + " (" + textStyle.fontSize + "px)",
            id: textStyle.id
        };
    });
    figma.ui.postMessage({ type: "populate-base-select", data: textStyles });
}
function SendMessage(message) {
    figma.notify(message);
}
// Main backend function, generate the styles and pass them to the UI
function Generate(options) {
    var data = {
        colors: [],
        sizes: [],
        remBaseSize: {},
        remSizes: [],
        effects: []
    };
    // No style checked
    if (!options.useColor && !options.useText && !options.useEffect) {
        figma.notify("⚠ Please select a style to generate.");
        return;
    }
    if (options.useColor) {
        var paintStyles = figma.getLocalPaintStyles().filter(function (paintStyle) {
            var color = paintStyle.paints[0];
            return color.type === "SOLID";
        });
        var colors = paintStyles.map(function (paintStyle) {
            var color = paintStyle.paints[0];
            var rgb = {
                red: BeautifyColor(color.color.r),
                green: BeautifyColor(color.color.g),
                blue: BeautifyColor(color.color.b)
            };
            var ColorStyle = "rgba(" + rgb.red + ", " + rgb.green + ", " + rgb.blue + ", " + color.opacity + ")";
            switch (options.colorStyle.toUpperCase()) {
                case "HEX":
                    ColorStyle = RGBToHex(rgb);
                    break;
                case "HSLA":
                    ColorStyle = RGBToHSL(rgb, color.opacity);
                    break;
            }
            return {
                name: FixNaming(paintStyle.name),
                ColorStyle: ColorStyle
            };
        });
        data.colors = colors;
    }
    if (options.useText) {
        var textStyles = figma.getLocalTextStyles();
        var textSizes = textStyles.map(function (textStyle) {
            return {
                name: FixNaming(textStyle.name),
                size: textStyle.fontSize,
                id: textStyle.id
            };
        });
        data.sizes = textSizes;
        if (options.useRem) {
            var baseSize_1 = textSizes.find(function (textStyle) {
                return textStyle.id === options.selectedBase;
            });
            if (baseSize_1 === undefined) {
                figma.notify("❗ Error: Selected base style doesn't exist.");
                GetBaseStyle();
                return;
            }
            var remSizes = textSizes.map(function (textStyle) {
                var remSize = textStyle.size / baseSize_1.size;
                return {
                    name: FixNaming(textStyle.name),
                    size: +remSize.toFixed(2)
                };
            });
            data.remBaseSize = baseSize_1;
            data.remSizes = remSizes;
        }
    }
    if (options.useEffect) {
        var effectStyles = figma.getLocalEffectStyles();
        var effects = effectStyles.map(function (effectStyle) {
            var _a = GenerateEffectStyle(effectStyle.effects), shadows = _a.shadows, blur = _a.blur;
            return {
                name: FixNaming(effectStyle.name),
                shadows: shadows,
                blur: blur
            };
        });
        data.effects = effects;
    }
    if (data.colors.length <= 0 &&
        data.sizes.length <= 0 &&
        data.effects.length <= 0) {
        figma.notify("⚠ No styles found.");
        return;
    }
    figma.ui.postMessage({ type: "generated", data: data });
}
function GenerateEffectStyle(effects) {
    var shadows = [];
    var blur = "";
    effects.forEach(function (effect) {
        if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
            shadows.push(GenerateShadowStyle(effect)); // can have multiple shadows on a single element
        }
        else if (effect.type === "LAYER_BLUR") {
            blur = "blur(" + effect.radius + "px)"; // can only have one blur-filter. Note: background_blur is not implemented in all browsers, so wont use that type of effect
        }
    });
    var result = {
        shadows: "" + shadows,
        blur: blur
    };
    return result;
}
function GenerateShadowStyle(_a) {
    var type = _a.type, color = _a.color, offset = _a.offset, radius = _a.radius;
    var alpha = Math.round(color.a * 100) / 100; // removes trailing numbers and beautifies the alpha (example: 0.05999943 becomes 0.06)
    var rgba = "rgba(" + BeautifyColor(color.r) + ", " + BeautifyColor(color.g) + ", " + BeautifyColor(color.b) + ", " + alpha + ")";
    // If the effect is set as INNER_SHADOW, the shadow should be set to inset (this is how Figma shows it in the code-tab)
    return (type === "INNER_SHADOW" ? "inset" : "") + " " + offset.x + "px " + offset.y + "px " + radius + "px " + rgba;
}
// Reason for this to be a backend function is that the UI doesn't have access to the notify function
function CopyToClipboard() {
    figma.ui.postMessage({ type: "copy" });
    figma.notify("📋 Styles copied to clipboard.");
}
// Figma uses slashes for grouping styles together. This turns that slash into a dash
function FixNaming(name) {
    return CamelCaseToKebabCase(name
        .trim()
        .replace(/([\/])/g, "--") // Figma uses / to separate different substyles, change this to BEM modifier
        .replace(/([\ ])/g, "-") // Remove any spaces
    ).toLowerCase();
}
function CamelCaseToKebabCase(name) {
    return "" + name.charAt(0) + name
        .substr(1)
        .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2"); // camelCase to kebab-case
}
// Figma stores the color value as a 0 to 1 decimal instead of 0 to 255.
function BeautifyColor(colorValue) {
    return Math.round(colorValue * 255);
}
// Takes a single color (red, green, or blue) and changes it to hex
function ColorToHex(rgb) {
    var hex = Number(rgb).toString(16);
    if (hex.length < 2) {
        hex = "0" + hex;
    }
    return hex.toUpperCase();
}
function RGBToHex(rgb) {
    var red = ColorToHex(rgb.red);
    var green = ColorToHex(rgb.green);
    var blue = ColorToHex(rgb.blue);
    return "#" + red + green + blue;
}
function RGBToHSL(rgb, alpha) {
    // Make red, green, and blue fractions of 1
    rgb.red /= 255;
    rgb.green /= 255;
    rgb.blue /= 255;
    // Find greatest and smallest channel values
    var cmin = Math.min(rgb.red, rgb.green, rgb.blue), cmax = Math.max(rgb.red, rgb.green, rgb.blue), delta = cmax - cmin, hue = 0, saturation = 0, lightness = 0;
    if (delta == 0)
        hue = 0;
    // Red is max
    else if (cmax == rgb.red)
        hue = ((rgb.green - rgb.blue) / delta) % 6;
    // Green is max
    else if (cmax == rgb.green)
        hue = (rgb.blue - rgb.red) / delta + 2;
    // Blue is max
    else
        hue = (rgb.red - rgb.green) / delta + 4;
    hue = Math.round(hue * 60);
    // Make negative hues positive behind 360°
    if (hue < 0)
        hue += 360;
    lightness = (cmax + cmin) / 2;
    // Calculate saturation
    saturation = delta == 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    // Multiply l and s by 100
    saturation = +(saturation * 100).toFixed(1);
    lightness = +(lightness * 100).toFixed(1);
    return "hsla(" + hue + ", " + saturation + "%, " + lightness + "%, " + alpha + ")";
}
