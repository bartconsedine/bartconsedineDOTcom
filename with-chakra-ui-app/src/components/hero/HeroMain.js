import {
    Flex,
    Heading,
    Image
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
            paddingLeft="20em"
        >
            <Flex {...boxStyles} direction="column" justifyContent={'center'} align="left">
                <Fade cascade damping={0.7}>
                    <Heading size={"4xl"} marginBottom=".5em">Bart Consedine</Heading>
                    <Heading {...bulletStyles}>Software Engineer</Heading>
                    <Heading {...bulletStyles}>Digital Marketing Expert</Heading>
                    <Heading {...bulletStyles}>Entrepreneur</Heading>
                </Fade>
            </Flex>
            <Flex {...boxStyles}>
                <Image borderRadius='full' src='https://bartconsedine.com/images/person_1.jpg'></Image>
            </Flex>
        </Flex>
    )
}

export default HeroMain