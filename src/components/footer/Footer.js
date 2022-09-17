import {
    Flex,
    Box
} from '@chakra-ui/react'

const Footer = () => {

    return (
        <Flex
            width={["100vw", null, "80vw"]}
            direction="row"
            justify={"space-around"}
            padding={["2em", null, "2em 2em"]}
            margin={["0", null, "1em"]}
            borderTop="1px solid white"
            fontSize={"2xl"}
            marginBottom="10em"
        >
            <Box>
                <a href="https://linkedin.com/in/bartconsedine" target={"_blank"}>
                    LinkedIn
                </a>
            </Box>
            <Box>
                <a href="mailto:bartconsedine@gmail.com" target={"_blank"}>
                    Email
                </a>
            </Box>
            <Box>
                <a href="./images/resume.jpg">
                    Resume
                </a>
            </Box>
        </Flex>
    )
}

export default Footer