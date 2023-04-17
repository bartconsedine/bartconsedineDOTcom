import {
    UnorderedList,
    ListItem,
    Heading,
    Flex,
    Box
} from '@chakra-ui/react'

import { Zoom, Fade } from "react-awesome-reveal"

import Headings from '../misc/Headings'

const Skills = () => {

    const softwareSkills = [
        "Javascript",
        "React JS",
        "Python",
        "ML / AI",
        "SciKit Learn",
        "Ruby on Rails",
        "Ruby",
        "Angular JS",
        "Python",
        "HTML",
        "CSS",
        "SQL",
        "Node JS"

    ]

    const advertisingSkills = [
        "Google Search",
        "Google Adwords",
        "Facebook",
        "Instagram",
        "Taboola",
        "Outbrain",
        "Display Advertising",
        "Landing Page Optimization",
        "Creative Optimization",
        "Campaign Optimization"
    ]

    const miscSkills = [
        "Excel",
        "Data Modeling",
        "Graphic Design",
        "Client Services",

    ]

    const employers = [
        "Start-Ups",
        "Advertising Technoloogy",
        "Advertising Agencies",
        "Information Technology",
        "Entrepreneur"

    ]

    const columnStyles = {
        marginTop: "5em",
        width: ["80vw",null,"20vw"],
        direction: "column"
    }

    const headingStyles = {
        size: "xl",
        marginBottom: ".2em"
    }

    const showSkills = (i) => {
        return i.map(item => { return (<ListItem fontSize="xl">{item}</ListItem>) })
    }

    return (
        <>
            <Zoom triggerOnce>
                <Box width='100vw' paddingLeft={["2em", null,"5em"]}>
                    <Headings title="skills"/>
                </Box>
            </Zoom>

            <Flex marginBottom="5em" align-content="left" direction={["column",null,"row"]} width="100vw" padding={["2em",null,"0 5em"]} justify="space-between">
                <Fade triggerOnce cascade damping={.2}>
                    <Flex {...columnStyles} marginTop={["1em",null,"5em",null ]}>
                        <Heading {...headingStyles}>Software</Heading>
                        <UnorderedList>{showSkills(softwareSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Advertising</Heading>
                        <UnorderedList>{showSkills(advertisingSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Misc.</Heading>
                        <UnorderedList>{showSkills(miscSkills)}</UnorderedList>
                    </Flex>
                    <Flex {...columnStyles} >
                        <Heading {...headingStyles}>Employers</Heading>
                        <UnorderedList>{showSkills(employers)}</UnorderedList>
                    </Flex>
                </Fade>
            </Flex>


        </>
    )
}

export default Skills