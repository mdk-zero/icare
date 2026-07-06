# iCare++ Mobile App

A React Native mobile application built with Expo for nursing education management.

## Prerequisites

- **Node.js** 18.x or later
- **npm** 9.x or later (comes with Node.js)
- **Expo CLI** (installed globally or via npx)
- For running on physical devices: **Expo Go** app (iOS/Android)

### Optional (for native builds)
- **Android Studio** (for Android emulator)
- **Xcode** (for iOS simulator, macOS only)

## Installation

1. Navigate to the project directory:
   ```bash
   cd icare-mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Reset to a clean project state:
   ```bash
   npm run reset-project
   ```

## Development

Start the development server:

```bash
npm run start
# or
npx expo start
```

This will start the Expo development server. You'll see options to:

- **Scan QR code** - Use Expo Go app on your physical device
- **Press a** - Open in Android emulator
- **Press i** - Open in iOS simulator (macOS only)
- **Press w** - Open in web browser

### Running Specific Platforms

```bash
# Android
npm run android

# iOS (macOS only)
npm run ios

# Web
npm run web
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start Expo development server |
| `npm run android` | Run on Android device/emulator |
| `npm run ios` | Run on iOS simulator (macOS) |
| `npm run web` | Run in web browser |
| `npm run lint` | Run ESLint to check code quality |
| `npm run reset-project` | Reset to clean project state |

## Project Structure

```
icare-mobile/
├── app/                  # Expo Router pages (file-based routing)
│   ├── (tabs)/           # Tab navigation screens
│   └── *.tsx             # Other screens
├── components/          # Reusable UI components
├── constants/           # Theme, colors, and configuration
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and helpers
├── src/                 # Source files (types, utilities)
├── assets/              # Images, fonts, and other assets
├── package.json         # Dependencies and scripts
├── app.json             # Expo configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── tsconfig.json        # TypeScript configuration
```

## Key Technologies

- **Expo SDK 54** - Development framework
- **Expo Router** - File-based navigation
- **React Native 0.81** - Cross-platform UI framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling (via NativeWind)

## Code Quality

Run linting to check for code issues:

```bash
npm run lint
```

## Troubleshooting

### Metro bundler issues
If you encounter bundler errors, try:
```bash
npx expo start --clear
```

### Cache issues
Clear the Metro cache:
```bash
npx expo start --reset-cache
```

### iOS pods issues (macOS)
```bash
cd ios
pod install
cd ..
```

### Android build issues
```bash
npx expo run:android --clean
```

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Guide](https://docs.expo.dev/router/introduction/)