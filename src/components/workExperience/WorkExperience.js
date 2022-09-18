import {
    Flex,
    Heading,
    Image,
    Box
} from '@chakra-ui/react'
import { Zoom } from "react-awesome-reveal"

import Headings from '../misc/Headings'

import Content from './Content.js'
import Positions from './Positions'



const WorkExperience = () => {

    const boxes = {
        direction: ["column", null, "row"],
        justify: ["flex-start", null, "space-between"],
    }

    return (
        <Flex marginTop={["5em", null, 0]} padding={["2em", null, "5em 5em 0 5em"]} direction="column" width="100vw" minH="100vh">
            <Zoom>
                <Headings title="work experience" />
            </Zoom>
            <Flex marginTop={[".25em", null, "5em"]} direction="column" >
                <Flex {...boxes} >
                    <Positions content={Content.SpringServe}></Positions>
                    <Positions content={Content.QuiBids}></Positions>
                </Flex>
                <Flex {...boxes} marginTop={["0", null, "5em"]} marginBottom="10em">
                    <Positions content={Content.Parsec}></Positions>
                    <Positions content={Content.SociaFly}></Positions>
                </Flex>
            </Flex>


        </Flex>
    )
}

export default WorkExperience