import * as React from 'react';
import { StyleSheet, Animated, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';

const HEADER_MAX = 80;
const HEADER_MIN = 44;
const SCROLL_DISTANCE = 60;

export default function CoachingHeader() {
    const { theme } = useTheme();
    const scrollY = useScrollY();

    const headerHeight = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [HEADER_MAX, HEADER_MIN],
        extrapolate: 'clamp',
    });

    // Full logo fades out in first 40% of scroll distance
    const fullLogoOpacity = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE * 0.4],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    // CC logo fades in over last 60% of scroll distance
    const ccLogoOpacity = scrollY.interpolate({
        inputRange: [SCROLL_DISTANCE * 0.4, SCROLL_DISTANCE],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    return (
        <Animated.View style={[styles.container, {
            backgroundColor: theme.headerBackground,
            height: headerHeight,
        }]}>
            {/* Full wide logo — explicit bounds so resizeMode contain works correctly */}
            <Animated.Image
                style={[styles.fullLogo, { opacity: fullLogoOpacity }]}
                source={require('../img/CherryCoachingLogo.png')}
                resizeMode="contain"
                accessible={true}
                accessibilityLabel="Cherry Coaching"
            />
            {/* Compact mark — constrained to fit the collapsed header */}
            <Animated.Image
                style={[styles.ccLogo, { opacity: ccLogoOpacity }]}
                source={require('../img/CCLogo.png')}
                resizeMode="contain"
                accessible={false}
            />
        </Animated.View>
    );
}

const CC_LOGO_SIZE = HEADER_MIN - 12; // 32px — 6px padding top/bottom at min height
const SCREEN_WIDTH = Dimensions.get('window').width;

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullLogo: {
        position: 'absolute',
        top: 4,
        left: 0,
        width: SCREEN_WIDTH,
        height: HEADER_MAX - 8,
    },
    ccLogo: {
        height: CC_LOGO_SIZE,
        width: CC_LOGO_SIZE,
    },
});
