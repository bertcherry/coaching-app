import CustomButton from "./Button"

export default function SocialSignIn() {
    const onSignInGoogle = () => {};
    const onSignInApple = () => {};

    return (
        <>
            <CustomButton onPress={onSignInGoogle} text="Sign In with Google" bgColor="#FAE9EA" fgColor="#DD4D44"></CustomButton>
            <CustomButton onPress={onSignInApple} text="Sign In with Apple" bgColor="#e3e3e3" fgColor="#363636"></CustomButton>
        </>
    )    
}