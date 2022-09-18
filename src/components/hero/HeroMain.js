import {
    Flex,
    Heading,
    Image,
    Box
} from '@chakra-ui/react'

import { Fade } from "react-awesome-reveal"

const HeroMain = () => {

    const boxStyles = {
        width: ['100vw', null, '50vw'],
        justify: 'left',
        align: 'center',
        height: ['50vh', null, '100vh'],

    }
    const bulletStyles = {
        size: "md",
        marginLeft: ["0", null, ".5em"]
    }

    return (
        <Flex
            minH="100vh"
            overflow="none"
            direction={["column", null, "row"]}
            paddingLeft={["1em", null, "10em"]}
        >
            <Flex zIndex={3} {...boxStyles} direction="column" justifyContent={'center'} align="left">
                <Heading size={"4xl"} marginBottom=".5em">Bart Consedine</Heading>
                <Box marginLeft={[".25em", null, "-.25em"]} topMargin="-5em">
                    <Fade cascade damping={1}>

                        <Heading {...bulletStyles}>Software Engineer</Heading>
                        <Heading {...bulletStyles}>Digital Marketing Expert</Heading>
                        <Heading {...bulletStyles}>Entrepreneur</Heading>
                        {/* <Image borderRadius='50%'  ></Image> */}
                    </Fade>
                </Box>
            </Flex>
            <Flex {...boxStyles}>
                <Image
                    marginLeft={["2em", null, "0"]}
                    borderRadius='full'
                    zIndex={2}
                    src='images/headshot.jpeg'
                />

            </Flex>
            {/* <Box position="absolute" borderRadius='0 0 0 70vh' top="0" right="0"zIndex={1} width="70vh" height="70vh" backgroundColor="#ade3b8"></Box> */}
            <Box
                position="absolute"
                top="0"
                right="0"
                borderLeft="70vh solid transparent"
                // borderRight="70vh solid transparent"
                borderTop='70vh solid #ade3b8'
                zIndex={1}
                opacity={[.8, null, 1]}
            >

            </Box>
        </Flex>
    )
}

export default HeroMain