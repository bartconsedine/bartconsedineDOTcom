import {
    Flex,
    Heading,
    Image,
    Box
} from '@chakra-ui/react'


import Content from './Content.js'

import Positions from './Positions'

import { Zoom } from "react-awesome-reveal"

const WorkExperience = () => {

    const boxes = {
        direction: ["column", null, "row"], 
        justify: "space-between"
    }

    return (
        <Flex padding="5em 5em 0 5em" direction="column" width="100vw" minH="100vh">

            <Heading size="4xl" marginBottom='1em'>work experience</Heading>
            <Flex marginTop="5em" direction="column" >
                <Zoom>
                    <Flex {...boxes} >
                        <Positions content={Content.SpringServe}></Positions>
                        <Positions content={Content.QuiBids}></Positions>

                    </Flex>
                    <Flex {...boxes} marginTop="5em" marginBottom="10em">
                        <Positions content={Content.Parsec}></Positions>
                        <Positions content={Content.SociaFly}></Positions>
                    </Flex>
                </Zoom>

            </Flex>


        </Flex>
    )
}

export default WorkExperience