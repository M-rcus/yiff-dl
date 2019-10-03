module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "rules": {
        "comma-dangle": ["error", {
            "arrays": "always-multiline",
            "objects": "always-multiline"
        }],
        "indent": [
            "error",
            4,
            { "SwitchCase": 1 },
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "no-console": 0,
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ]
    }
};
